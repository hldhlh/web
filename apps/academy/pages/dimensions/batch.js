(function(root) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  class BatchError extends Error { constructor(code,message) { super(message); this.code=code; } }
  const fail = (code,message) => { throw new BatchError(code,message); };
  const keys = (value, allowed) => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k=>!allowed.includes(k))) fail('INVALID_REQUEST','存在不支持的字段或数据结构');
  };
  const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(value) && !['__proto__','constructor','prototype'].includes(value);
  const canonical = value => JSON.stringify(value, function(k,v) { return v && typeof v==='object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(key=>[key,v[key]])) : v; });
  const fields = ['type','start','end','points','label','labels','style','labelPosition','locked'];
  function validate(item, meta) {
    if (!['line','rect','circle'].includes(item.type)) fail('INVALID_REQUEST','标注类型必须是 line、rect 或 circle');
    function point(p) {
      keys(p,['x','y']);
      if (![p.x,p.y].every(Number.isFinite) || p.x<0 || p.y<0 || p.x>meta.width || p.y>meta.height) fail('BOUNDS','坐标必须位于原图范围内');
    }
    point(item.start); point(item.end);
    if (item.type==='circle') { const r=Math.hypot(item.end.x-item.start.x,item.end.y-item.start.y); if (item.start.x-r<0||item.start.y-r<0||item.start.x+r>meta.width||item.start.y+r>meta.height) fail('BOUNDS','圆形超出原图范围'); }
    if (item.type==='rect' && (item.start.x===item.end.x || item.start.y===item.end.y)) fail('GEOMETRY','矩形不能为零宽或零高');
    if (item.start.x===item.end.x && item.start.y===item.end.y) fail('GEOMETRY','标注起点和终点不能重合');
    if (item.points!==undefined) { if (item.type!=='rect' || !Array.isArray(item.points) || item.points.length!==4) fail('GEOMETRY','矩形需有四个顶点'); item.points.forEach(point); }
    if (item.label!==undefined && (typeof item.label!=='string' || item.label.length>2000)) fail('INVALID_REQUEST','标注文字最多 2000 字符');
    if (item.labels!==undefined) { keys(item.labels,['top','right','bottom','left']); if (Object.values(item.labels).some(v=>typeof v!=='string'||v.length>2000)) fail('INVALID_REQUEST','边标注文字无效'); }
    if (item.style!==undefined && !['light','dark','outline'].includes(item.style)) fail('INVALID_REQUEST','标注样式无效');
    if (item.labelPosition!==undefined && !['center','above','inline'].includes(item.labelPosition)) fail('INVALID_REQUEST','文字位置无效');
    if (item.locked!==undefined && typeof item.locked!=='boolean') fail('INVALID_REQUEST','locked 必须为布尔值');
  }
  function snapshot(row) {
    return {projectId:row.payload.meta.id,version:row.ts,coordinateSystem:'原图像素；左上角为 (0,0)，x 向右、y 向下；与视口缩放无关',image:clone(row.payload.meta),annotations:Object.values(row.payload.annotations).filter(a=>!a.deleted).map(clone),lastBatch:row.payload.aiBatch ? {requestId:row.payload.aiBatch.requestId,undoable:!row.payload.aiBatch.undo} : null};
  }
  function plan(row, input, actor, uuid=()=>crypto.randomUUID()) {
    keys(input,['projectId','expectedVersion','requestId','operations','undo']);
    if (!validId(input.projectId) || input.projectId!==row.payload.meta.id || !validId(input.requestId) || !Number.isSafeInteger(input.expectedVersion)) fail('INVALID_REQUEST','项目、版本或 requestId 无效');
    const fingerprint=canonical(input), previous=row.payload.aiBatch;
    if (previous?.requestId===input.requestId) {
      if (previous.fingerprint!==fingerprint) fail('IDEMPOTENCY_CONFLICT','requestId 已用于另一批内容');
      return {alreadyApplied:true,payload:clone(row.payload),changes:previous.changes};
    }
    if (row.ts!==input.expectedVersion) fail('CONFLICT','项目已更新，请重新导出数据并核对修改');
    if (!Number.isFinite(row.payload.meta.width)||!Number.isFinite(row.payload.meta.height)) fail('INVALID_REQUEST','项目图片尺寸缺失');
    const payload=clone(row.payload), before={}, changes=[], now=new Date().toISOString();
    const stamp = value => ({...value,version:uuid(),updatedAt:now,updatedBy:actor,createdAt:value.createdAt||now,createdBy:value.createdBy||actor});
    if (input.undo!==undefined) {
      if (input.operations!==undefined || input.undo!==true || !previous || previous.undo) fail('INVALID_REQUEST','没有可撤销的上一批修改');
      // Refuse to undo if any affected annotation was edited after the batch.
      for (const [id,version] of Object.entries(previous.after)) if (payload.annotations[id]?.version!==version) fail('CONFLICT','上一批标注已被修改，不能整批撤销');
      for (const [id,value] of Object.entries(previous.before)) {
        before[id]=clone(payload.annotations[id]);
        payload.annotations[id]=stamp(value || {...payload.annotations[id],deleted:true});
        changes.push({id,action:'undo',before:before[id],after:clone(payload.annotations[id])});
      }
    } else {
      if (!Array.isArray(input.operations)||!input.operations.length||input.operations.length>100) fail('INVALID_REQUEST','每批需要 1–100 个操作');
      const seen=new Set();
      for (const op of input.operations) {
        keys(op,['op','id','changes']);
        if (!validId(op.id)||seen.has(op.id)) fail('INVALID_REQUEST','标注 ID 无效或在本批重复'); seen.add(op.id);
        if (!['create','update','delete'].includes(op.op)) fail('INVALID_REQUEST','操作必须是 create、update 或 delete');
        const old=payload.annotations[op.id];
        if (op.op==='create' ? !!old : !old || old.deleted) fail('NOT_FOUND','新增 ID 已存在，或目标标注不存在');
        if (op.op==='delete' && op.changes!==undefined) fail('INVALID_REQUEST','删除不能携带 changes');
        if (op.op!=='delete') { keys(op.changes,fields); if (!Object.keys(op.changes).length) fail('INVALID_REQUEST','changes 不能为空'); }
        if (old?.locked && !(op.op==='update' && Object.keys(op.changes).length===1 && op.changes.locked===false)) fail('LOCKED','标注已锁定，请单独解锁后再修改');
        before[op.id]=old ? clone(old) : null;
        const value=op.op==='delete' ? {...old,deleted:true} : {...(old||{id:op.id,label:'',style:'light',labelPosition:'center'}),...clone(op.changes),deleted:false};
        if (op.op!=='delete') {
          // A rectangle's renderer prioritizes points. Rebuild them when endpoints change.
          if (value.type==='rect' && !Object.hasOwn(op.changes,'points') && (op.changes.start||op.changes.end)) value.points=[value.start,{x:value.end.x,y:value.start.y},value.end,{x:value.start.x,y:value.end.y}].map(clone);
          validate(value,payload.meta);
        }
        payload.annotations[op.id]=stamp(value);
        changes.push({id:op.id,action:op.op,before:before[op.id],after:clone(payload.annotations[op.id])});
      }
    }
    payload.meta={...payload.meta,updatedAt:now,updatedBy:actor,count:Object.values(payload.annotations).filter(a=>!a.deleted).length};
    // Keep only the latest receipt to bound project size. Older retries fail the version check.
    payload.aiBatch={requestId:input.requestId,fingerprint,before,after:Object.fromEntries(changes.map(c=>[c.id,c.after.version])),changes:changes.map(({id,action})=>({id,action})),undo:input.undo===true};
    return {payload,changes,alreadyApplied:false};
  }
  const api={BatchError,snapshot,plan};
  if (typeof module!=='undefined'&&module.exports) module.exports=api;
  root.DimensionBatch=api;
})(globalThis);
