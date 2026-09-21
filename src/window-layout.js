const ratio = 256 / 135;

function constrainWindow(window) {
  window.setAspectRatio(ratio);
  window.on('will-resize', (event, bounds, details) => {
    if (window.isMaximized() || window.isFullScreen()) return;
    const previous = window.getBounds();
    const vertical = ['top', 'bottom'].includes(details?.edge);
    const width = vertical ? Math.round(bounds.height * ratio) : bounds.width;
    const height = vertical ? bounds.height : Math.round(width / ratio);
    if (bounds.width === width && bounds.height === height) return;
    event.preventDefault();
    const x = details?.edge?.includes('left') ? previous.x + previous.width - width : bounds.x;
    const y = details?.edge?.includes('top') ? previous.y + previous.height - height : bounds.y;
    window.setBounds({ x, y, width, height });
  });
}

module.exports = { constrainWindow };
