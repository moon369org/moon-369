// Moon for Figma: export the selected frame, have Moon sign its fingerprint, and (optionally) add a
// Moonmark + QR label to the canvas. The exported file is handed to the panel so the designer can keep
// the exact bytes that were signed.
figma.showUI(__html__, { width: 360, height: 560, themeColors: false });

function selected() {
  const s = figma.currentPage.selection;
  return s.length === 1 ? s[0] : null;
}
function announce() {
  const n = selected();
  figma.ui.postMessage({ type: 'selection', name: n ? n.name : null, count: figma.currentPage.selection.length });
}
figma.on('selectionchange', announce);
announce();

figma.ui.onmessage = async (m) => {
  if (m.type === 'export') {
    const n = selected();
    if (!n || !('exportAsync' in n)) { figma.ui.postMessage({ type: 'error', message: 'Select one frame, group or layer first.' }); return; }
    try {
      const bytes = await n.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 2 } });
      figma.ui.postMessage({ type: 'exported', name: n.name, bytes });
    } catch (e) { figma.ui.postMessage({ type: 'error', message: 'Could not export: ' + (e && e.message || e) }); }
  } else if (m.type === 'label') {
    // A small Moonmark card beside the design: the QR (vector) and the Moonmark text.
    const n = selected();
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    const frame = figma.createFrame();
    frame.name = 'Signed on Moon · ' + m.moonmark;
    frame.layoutMode = 'VERTICAL'; frame.itemSpacing = 10; frame.paddingTop = frame.paddingBottom = frame.paddingLeft = frame.paddingRight = 16;
    frame.primaryAxisSizingMode = 'AUTO'; frame.counterAxisSizingMode = 'AUTO';
    frame.fills = [{ type: 'SOLID', color: { r: 0.043, g: 0.043, b: 0.051 } }];
    const qr = figma.createNodeFromSvg(m.qrSvg); qr.resize(160, 160); qr.name = 'QR: scan to check'; frame.appendChild(qr);
    const t = figma.createText(); t.fontName = { family: 'Inter', style: 'Regular' }; t.fontSize = 11;
    t.characters = 'SIGNED ON MOON\n' + m.moonmark; t.fills = [{ type: 'SOLID', color: { r: 0.914, g: 0.894, b: 0.847 } }];
    frame.appendChild(t);
    if (n && 'x' in n) { frame.x = n.x + ('width' in n ? n.width : 0) + 40; frame.y = n.y; }
    figma.currentPage.appendChild(frame);
    figma.notify('Added the Moonmark label. It is not part of the signed export.');
  } else if (m.type === 'close') figma.closePlugin();
};
