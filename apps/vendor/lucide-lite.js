/* Minimal Lucide-compatible icon renderer for the icons used by course/admin.html. */
(function () {
  const icons = {
    'chevron-left': '<path d="m15 18-6-6 6-6"/>',
    monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
    award: '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',
    'list-video': '<path d="M12 12H3"/><path d="M16 6H3"/><path d="M12 18H3"/><path d="m16 15 5 3-5 3z"/>',
    'message-square': '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    eye: '<path d="M2.1 12a10.5 10.5 0 0 1 19.8 0 10.5 10.5 0 0 1-19.8 0"/><circle cx="12" cy="12" r="3"/>',
    'trash-2': '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/>'
  };

  function createIcons() {
    document.querySelectorAll('[data-lucide]').forEach((node) => {
      const name = node.getAttribute('data-lucide');
      const content = icons[name];
      if (!content) return;
      const size = node.getAttribute('size') || node.getAttribute('width') || 24;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      for (const attribute of node.attributes) {
        if (attribute.name !== 'data-lucide' && attribute.name !== 'size') svg.setAttribute(attribute.name, attribute.value);
      }
      svg.setAttribute('width', size);
      svg.setAttribute('height', size);
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.setAttribute('aria-hidden', 'true');
      svg.innerHTML = content;
      node.replaceWith(svg);
    });
  }

  window.lucide = { createIcons };
})();
