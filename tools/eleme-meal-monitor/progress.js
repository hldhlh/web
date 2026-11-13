(() => {
  globalThis.MealProgress = {
    remaining(order, minutes) {
      if (order.clockStalled) return Infinity;
      if (Number.isFinite(order.targetRemaining)) return order.targetRemaining;
      if (Number.isFinite(order.elapsedRange?.max)) return minutes * 60 - order.elapsedRange.max;
      return Number.isFinite(order.platformRemaining) ? order.platformRemaining : Infinity;
    },
    compareOrders(a, b, minutes) {
      const left = this.remaining(a.order, minutes), right = this.remaining(b.order, minutes);
      const overdue = item => !item.order.clockStalled && (item.order.judgment === 'overdue' || (item.order.elapsed === null && !item.order.elapsedRange && item.order.platformRemaining < 0));
      const group = Number(overdue(b)) - Number(overdue(a));
      if (group) return group;
      if (left !== right) return left < right ? -1 : 1;
      return `${a.platform}:${a.order.label}`.localeCompare(`${b.platform}:${b.order.label}`, 'en', {numeric:true});
    },
    describe(order, minutes) {
      const target = minutes * 60;
      const min = order.elapsed ?? order.elapsedRange?.min;
      const max = order.elapsed ?? order.elapsedRange?.max;
      if (!Number.isFinite(min) || !Number.isFinite(max) || target <= 0) return null;
      const percent = value => Math.max(0, Math.min(100, value / target * 100));
      return {min, max, target, fill: percent(min), upper: percent(max), overtime: Math.max(0, min - target), overtimeMax: Math.max(0, max - target), extraFill: percent(min - target), extraUpper: percent(max - target), state: min >= target ? 'overdue' : max >= target ? 'boundary' : 'within', ranged: min !== max};
    }
  };
})();
