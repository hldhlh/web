(() => {
  let running = false;
  const clocks = new Map();
  const visible = element => Boolean(element?.isConnected && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
  const blocked = () => [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], [class*="captcha"], [id*="captcha"], [class*="verify-dialog"], .roo-modal, .ant-modal')].some(visible);
  const message = value => chrome.runtime.sendMessage(value);
  function observe(sample) {
    const now = Date.now();
    for (const order of sample?.orders || []) {
      const value = Number.isInteger(order.elapsed) ? `e${order.elapsed}` : `r${order.remaining}`;
      const previous = clocks.get(order.key);
      clocks.set(order.key, {value, changed: previous && previous.value !== value ? now : previous?.changed || 0});
    }
  }
  function elapsed(order) {
    return Number.isInteger(order.elapsed) ? order.elapsed : Number.isSafeInteger(order.acceptedMinute) ? Math.max(0, Math.floor((Date.now() - order.acceptedMinute) / 1000) - 60) : null;
  }
  async function execute(command, collect, platform) {
    if (!command || running) return;
    running = true;
    let result = '未执行：订单状态已变化';
    let success = false;
    const check = () => {
      const current = collect();
      const order = current.sample?.orders.find(o => o.key === command.key);
      const button = current.buttons.get(command.key);
      const clock = clocks.get(command.key);
      const value = order && elapsed(order);
      if (blocked()) throw new Error('检测到弹窗或验证，请人工处理后恢复');
      if (!order || !visible(button) || button.disabled || button.getAttribute('aria-disabled') === 'true' || /disabled/.test(button.className)) throw new Error('出餐按钮不可用或订单已变化');
      if (!clock?.changed || Date.now() - clock.changed > 3000 || value === null || value < command.threshold) throw new Error('页面计时未刷新或尚未到目标，已暂停');
      const rect = button.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      if (!hit || !(button === hit || button.contains(hit))) throw new Error('出餐按钮被遮挡或不在可见区域，请调整页面后恢复');
      return {button, count: current.sample.count};
    };
    try {
      check();
      const permit = await message({type: 'autoPermit', platform, token: command.token});
      if (!permit?.allowed) throw new Error('自动出餐已暂停或设置已更改');
      const {button} = check();
      button.click();
      result = '点击后未确认出餐成功，请检查订单后恢复';
      for (let i = 0; i < 24; i++) {
        await new Promise(resolve => setTimeout(resolve, 250));
        if (blocked()) throw new Error('点击后出现弹窗或验证，请人工处理后恢复');
        if (collect().completed.has(command.key)) { success = true; result = `#${command.label} 已确认出餐`; break; }
      }
    } catch (error) { result = error.message || result; }
    finally {
      try { await message({type: 'autoResult', platform, token: command.token, success, reason: result}); } catch {}
      running = false;
    }
  }
  globalThis.MealAuto = {observe, execute, ready: () => [...clocks].filter(([, clock]) => clock.changed && Date.now() - clock.changed <= 3000).map(([key]) => key)};
})();
