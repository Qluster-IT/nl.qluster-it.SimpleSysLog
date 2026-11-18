'use strict';

// Shared by the dashboard widget, the settings designer previews and the tests, so a
// design renders the same everywhere. A design has rows of columns that share four units.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SSLWidgetLayout = api;
}(typeof self !== 'undefined' ? self : this, function () {
  var ELEMENT_IDS = ['timestamp', 'severity', 'facility', 'app', 'hostname', 'message'];
  var DEFAULT_SIZES = { timestamp: 12, severity: 10, facility: 10, app: 11, hostname: 11, message: 13, daySeparator: 11,
    search: 13, filter: 13, previousPage: 13, pageNumber: 12, nextPage: 13 };
  var CONTROL_AREAS = {
    toolbar: { key: 'toolbarLayout', ids: ['search', 'filter'], gap: 6 },
    paging: { key: 'pagingLayout', ids: ['previousPage', 'pageNumber', 'nextPage'], gap: 8 }
  };
  var CONTROL_IDS = CONTROL_AREAS.toolbar.ids.concat(CONTROL_AREAS.paging.ids);
  var CONTROL_STYLE_LIMITS = { height: [4, 100], paddingX: [0, 40], paddingY: [0, 40], radius: [0, 100] };
  // The day separator has its own small grid with the date and a line as elements.
  // The date keeps the "daySeparator" ID that designs size and themes colour.
  var DAY_SEPARATOR_ID = 'daySeparator';
  var DAY_SEPARATOR_LINE_ID = 'daySeparatorLine';
  var SEPARATOR_ELEMENT_IDS = [DAY_SEPARATOR_ID, DAY_SEPARATOR_LINE_ID];
  var MAX_SEPARATOR_ROWS = 2;
  var LINE_STYLES = ['solid', 'dashed', 'dotted', 'double'];
  var LINE_POSITIONS = ['behind', 'above', 'below'];
  var MAX_LINE_THICKNESS = 10;
  // Border elements draw a severity-coloured border on one side of their column. A column that covers that whole
  // side of the card draws it as the card's own border, so it follows the card's rounded corners.
  var BORDER_IDS = ['border1', 'border2', 'border3', 'border4'];
  var BORDER_SIDES = ['left', 'top', 'right', 'bottom'];
  var DEFAULT_BORDER_SIDES = { border1: 'left', border2: 'right', border3: 'top', border4: 'bottom' };
  var DEFAULT_BORDER_THICKNESS = 4;
  var CARD_ELEMENT_IDS = ELEMENT_IDS.concat(BORDER_IDS);
  // Font choices with stacks that fall back to a generic family every browser has.
  var FONTS = {
    system: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    'sans-serif': 'Arial, Helvetica, sans-serif',
    serif: 'Georgia, "Times New Roman", Times, serif',
    monospace: '"Courier New", Courier, monospace',
    verdana: 'Verdana, Geneva, Tahoma, sans-serif',
    trebuchet: '"Trebuchet MS", "Lucida Grande", sans-serif',
    times: '"Times New Roman", Times, serif'
  };
  var FONT_IDS = Object.keys(FONTS);
  // Text options a design can set per element; an element without a choice keeps its CSS default.
  var TEXT_STYLES = {
    textCase: { property: 'textTransform', values: { none: 'none', uppercase: 'uppercase', lowercase: 'lowercase', capitalize: 'capitalize' } },
    weight: { property: 'fontWeight', values: { normal: '400', medium: '500', semibold: '600', bold: '700', extrabold: '800' } },
    italic: { property: 'fontStyle', values: { off: 'normal', on: 'italic' } },
    spacing: { property: 'letterSpacing', values: { none: '0', narrow: '0.04em', wide: '0.08em' } },
    wrap: { property: 'whiteSpace', values: { normal: 'normal', nowrap: 'nowrap', words: 'pre' } }
  };
  var UNITS = 5;
  var MAX_ROWS = 10;

  function emptyRows(count) {
    var rows = [];
    for (var index = 0; index < count; index++) {
      var row = [];
      for (var unit = 0; unit < UNITS; unit++) row.push(false);
      rows.push(row);
    }
    return rows;
  }

  // Places every column in the unit tracks. Columns spanning rows reserve their
  // units in the rows below; columns that no longer fit merge into the previous column.
  function computeLayout(design) {
    var rows = design && Array.isArray(design.rows) ? design.rows : [];
    var occupied = emptyRows(rows.length);
    var cells = [];
    var layoutRows = rows.map(function (row, rowIndex) {
      var columns = row && Array.isArray(row.columns) ? row.columns : [];
      var rowCells = [];
      var cursor = 0;
      columns.forEach(function (column, columnIndex) {
        var start = -1;
        for (var unit = cursor; unit < UNITS; unit++) {
          if (!occupied[rowIndex][unit]) { start = unit; break; }
        }
        var elements = Array.isArray(column.elements) ? column.elements.slice() : [];
        if (start === -1) {
          if (rowCells.length) rowCells[rowCells.length - 1].elements = rowCells[rowCells.length - 1].elements.concat(elements);
          return;
        }
        var contiguous = 0;
        while (start + contiguous < UNITS && !occupied[rowIndex][start + contiguous]) contiguous++;
        var freeAfter = 0;
        for (var free = start; free < UNITS; free++) if (!occupied[rowIndex][free]) freeAfter++;
        var reserved = Math.min(columns.length - columnIndex - 1, freeAfter - 1);
        var span = Math.max(1, Math.min(Number(column.span) || 1, contiguous, freeAfter - reserved));
        var rowSpan = Math.max(1, Math.min(Number(column.rowSpan) || 1, rows.length - rowIndex));
        while (rowSpan > 1 && !isFree(occupied, rowIndex + 1, rowIndex + rowSpan, start, span)) rowSpan--;
        for (var markRow = rowIndex; markRow < rowIndex + rowSpan; markRow++) {
          for (var markUnit = start; markUnit < start + span; markUnit++) occupied[markRow][markUnit] = true;
        }
        var cell = {
          row: rowIndex,
          column: columnIndex,
          start: start,
          span: span,
          rowSpan: rowSpan,
          align: column.align || 'left',
          valign: column.valign || 'top',
          direction: column.direction || 'horizontal',
          width: column.width || 'span',
          padding: Number(row.padding) || 0,
          elementGap: column.elementGap,
          elements: elements
        };
        rowCells.push(cell);
        cells.push(cell);
        cursor = start + span;
      });
      return { index: rowIndex, cells: rowCells, template: '', columnGap: row && row.columnGap };
    });
    var spanning = cells.some(function (cell) { return cell.rowSpan > 1; });
    var tracks = '';
    var trackList = [];
    if (spanning) {
      // Like Chronograph, columns spanning rows fit their content.
      for (var track = 0; track < UNITS; track++) {
        var covering = cells.filter(function (cell) { return cell.start <= track && cell.start + cell.span > track; });
        var fits = covering.length && covering.every(function (cell) { return cell.width === 'content' || cell.rowSpan > 1; });
        trackList.push(fits ? 'auto' : 'minmax(0, 1fr)');
      }
      tracks = trackList.join(' ');
      cells.forEach(function (cell) {
        cell.gridColumn = (cell.start + 1) + ' / span ' + cell.span;
        cell.gridRow = (cell.row + 1) + ' / span ' + cell.rowSpan;
      });
    } else {
      layoutRows.forEach(function (row) {
        var parts = [];
        var unit = 0;
        var gap = 0;
        row.cells.slice().sort(function (first, second) { return first.start - second.start; }).forEach(function (cell) {
          if (cell.start > unit) gap += cell.start - unit;
          if (gap) parts.push('minmax(0, ' + gap + 'fr)');
          gap = 0;
          parts.push(cell.width === 'content' ? 'auto' : 'minmax(0, ' + cell.span + 'fr)');
          cell.gridColumn = String(parts.length);
          cell.gridRow = '1';
          unit = cell.start + cell.span;
        });
        if (unit < UNITS) parts.push('minmax(0, ' + (UNITS - unit) + 'fr)');
        row.parts = parts;
        row.template = parts.join(' ');
      });
    }
    return { spanning: spanning, tracks: tracks, trackList: trackList, rows: layoutRows, cells: cells };
  }

  function isFree(occupied, fromRow, toRow, start, span) {
    for (var row = fromRow; row < toRow; row++) {
      for (var unit = start; unit < start + span; unit++) if (occupied[row][unit]) return false;
    }
    return true;
  }

  function usedElements(design) {
    var used = [];
    (design && Array.isArray(design.rows) ? design.rows : []).forEach(function (row) {
      (row.columns || []).forEach(function (column) {
        (column.elements || []).forEach(function (id) { if (used.indexOf(id) === -1) used.push(id); });
      });
    });
    return used;
  }

  function colorValue(value) {
    if (value === 'severity') return 'var(--ssl-sev)';
    if (value === 'none') return 'transparent';
    if (isHexColor(value)) return value;
    return 'var(--ssl-color-' + value + ')';
  }

  function isHexColor(value) { return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value); }

  function widgetStyle(design, theme) {
    var style = {};
    Object.keys(theme && theme.colors || {}).forEach(function (key) {
      var value = theme.colors[key];
      if (value && value !== 'automatic') style['--ssl-' + key] = colorValue(value);
    });
    if (design && design.widgetBorderWidth) style['--ssl-outline-width'] = design.widgetBorderWidth + 'px';
    if (design && design.widgetBorderless) {
      style['--ssl-outline-width'] = '0px';
      style['--ssl-frame-shadow'] = 'none';
    }
    Object.keys(design && design.widgetPadding || {}).forEach(function (side) {
      style['--ssl-widget-padding-' + side] = design.widgetPadding[side] + 'px';
    });
    var background = theme && theme.colors && theme.colors.background;
    if (theme && theme.backgroundGradient && background && background !== 'automatic') {
      var surface = 'var(--ssl-gradient-surface)';
      var color = colorValue(background);
      style['--ssl-background'] = surface;
      style['background-image'] = 'linear-gradient(to bottom, color-mix(in srgb, ' + color
        + ' 22%, ' + surface + '), color-mix(in srgb, ' + color + ' 11%, ' + surface + '))';
    }
    return style;
  }

  function elementSize(design, id) {
    var sizes = design && design.elementSizes;
    return sizes && Number.isInteger(sizes[id]) ? sizes[id] : DEFAULT_SIZES[id];
  }

  // Empty when the element keeps the widget's own font.
  function elementFont(design, id) {
    var fonts = design && design.elementFonts;
    return fonts && Object.prototype.hasOwnProperty.call(FONTS, fonts[id]) ? FONTS[fonts[id]] : '';
  }

  // Content-sized tracks read a minimum width from a CSS variable, so alignContentTracks can give
  // the same column the same width in every card of a list.
  function sharedTemplate(node, parts, name) {
    var content = [];
    var template = parts.map(function (part, index) {
      if (part !== 'auto') return part;
      content.push(index);
      return 'minmax(var(' + name + index + ', auto), auto)';
    }).join(' ');
    if (content.length) {
      node.setAttribute('data-ssl-tracks', name);
      node.setAttribute('data-ssl-content-tracks', content.join(','));
    }
    return template;
  }

  // Measures every content-sized track below root and sets the widest as the minimum for all of them.
  function alignContentTracks(root) {
    var view = root && root.ownerDocument && root.ownerDocument.defaultView;
    if (!view || typeof view.getComputedStyle !== 'function') return;
    (root.sslTrackNames || []).forEach(function (name) { root.style.removeProperty(name); });
    var widths = {};
    Array.prototype.forEach.call(root.querySelectorAll('[data-ssl-tracks]'), function (node) {
      var name = node.getAttribute('data-ssl-tracks');
      var sizes = String(view.getComputedStyle(node).gridTemplateColumns || '').split(/\s+/);
      node.getAttribute('data-ssl-content-tracks').split(',').forEach(function (index) {
        var width = parseFloat(sizes[Number(index)]);
        if (isFinite(width) && width > (widths[name + index] || 0)) widths[name + index] = width;
      });
    });
    root.sslTrackNames = Object.keys(widths);
    root.sslTrackNames.forEach(function (name) { root.style.setProperty(name, Math.ceil(widths[name]) + 'px'); });
  }

  // Fills a container with the rows and columns of a grid; renderItem(id, cell) returns an element's node or null.
  // options: selectedRow and selectedColumn ({ row, column }) for the designer preview outline;
  // trackPrefix names the CSS variables shared by grids of the same kind (see alignContentTracks).
  function renderGrid(doc, grid, container, renderItem, options, trackPrefix) {
    var layout = computeLayout(grid);
    var trackName = '--ssl-' + trackPrefix;
    var customColumnGaps = layout.spanning && layout.rows.some(function (row) { return row.columnGap !== undefined; });
    if (layout.spanning) {
      container.classList.add('ssl-grid-spanning');
      container.style.gridTemplateColumns = sharedTemplate(container, layout.trackList, trackName + '-track-');
      if (customColumnGaps) container.style.columnGap = '0px';
    }
    var selectedColumn = options.selectedColumn;
    function addCell(parent, cell) {
      var node = doc.createElement('div');
      node.className = 'ssl-grid-cell';
      if (selectedColumn && selectedColumn.row === cell.row && selectedColumn.column === cell.column) node.classList.add('ssl-preview-selected');
      node.setAttribute('data-direction', cell.direction);
      node.setAttribute('data-align', cell.align);
      node.setAttribute('data-valign', cell.valign);
      node.style.gridColumn = cell.gridColumn;
      node.style.gridRow = cell.gridRow;
      if (cell.padding) node.style.paddingTop = cell.padding + 'px';
      if (cell.elementGap !== undefined) node.style.gap = cell.elementGap + 'px';
      if (customColumnGaps && cell.start + cell.span < UNITS) {
        var gap = layout.rows[cell.row].columnGap;
        if (gap === undefined) gap = grid.gap === undefined ? 10 : grid.gap;
        node.style.paddingRight = 'calc(' + gap + 'px + var(--ssl-border-padding-right, 0px))';
      }
      cell.elements.forEach(function (id) {
        var item = renderItem(id, cell, node);
        if (item) node.appendChild(item);
      });
      parent.appendChild(node);
    }
    if (layout.spanning) {
      layout.cells.forEach(function (cell) { addCell(container, cell); });
      if (typeof options.selectedRow === 'number' && layout.rows[options.selectedRow]) {
        // Cells span several rows here, so an overlay on the row's track marks the row like Chronograph does.
        var overlay = doc.createElement('div');
        overlay.className = 'ssl-preview-row-overlay ssl-preview-selected';
        overlay.style.gridColumn = '1 / -1';
        overlay.style.gridRow = String(options.selectedRow + 1);
        container.appendChild(overlay);
      }
    } else {
      layout.rows.forEach(function (row, rowIndex) {
        var rowNode = doc.createElement('div');
        rowNode.className = 'ssl-grid-row' + (options.selectedRow === rowIndex ? ' ssl-preview-selected' : '');
        rowNode.style.gridTemplateColumns = sharedTemplate(rowNode, row.parts, trackName + '-r' + rowIndex + '-track-');
        if (row.columnGap !== undefined) rowNode.style.columnGap = row.columnGap + 'px';
        row.cells.forEach(function (cell) { addCell(rowNode, cell); });
        container.appendChild(rowNode);
      });
    }
    return container;
  }

  function applyText(item, design, theme, id) {
    item.style.fontSize = elementSize(design, id) + 'px';
    if (design && design.elementLineHeights && design.elementLineHeights[id] !== undefined) {
      item.style.lineHeight = design.elementLineHeights[id] + 'px';
    }
    var font = elementFont(design, id);
    if (font) item.style.fontFamily = font;
    var text = design && design.elementTextStyles ? design.elementTextStyles[id] : null;
    if (text) {
      Object.keys(TEXT_STYLES).forEach(function (option) {
        var style = TEXT_STYLES[option];
        if (Object.prototype.hasOwnProperty.call(style.values, text[option])) item.style[style.property] = style.values[text[option]];
      });
    }
    var colors = theme && theme.elements ? theme.elements[id] : null;
    if (colors && colors.color && colors.color !== 'default') item.style.color = colorValue(colors.color);
    return colors;
  }

  function elementBorder(design, id) {
    var borders = design && design.elementBorders;
    var border = borders && borders[id];
    return {
      side: border && BORDER_SIDES.indexOf(border.side) !== -1 ? border.side : DEFAULT_BORDER_SIDES[id],
      thickness: border && Number.isInteger(border.thickness) && border.thickness >= 1 && border.thickness <= MAX_LINE_THICKNESS
        ? border.thickness : DEFAULT_BORDER_THICKNESS
    };
  }

  function coversSide(cell, side, rowCount) {
    var allRows = cell.row === 0 && cell.row + cell.rowSpan >= rowCount;
    var allUnits = cell.start === 0 && cell.start + cell.span >= UNITS;
    if (side === 'left') return cell.start === 0 && allRows;
    if (side === 'right') return cell.start + cell.span >= UNITS && allRows;
    if (side === 'top') return cell.row === 0 && allUnits;
    return cell.row + cell.rowSpan >= rowCount && allUnits;
  }

  function capitalize(text) { return text.charAt(0).toUpperCase() + text.slice(1); }

  // values: element id -> text. options: severityClass, labels, showEmpty, selectedElement,
  // selectedCard, selectedRow and selectedColumn ({ row, column }) for the designer preview outline.
  function renderCard(doc, design, theme, values, options) {
    options = options || {};
    var card = doc.createElement('article');
    card.className = 'ssl-log-card ssl-grid-card' + (options.severityClass ? ' ' + options.severityClass : '')
      + (options.selectedCard ? ' ssl-preview-selected' : '');
    var rowCount = design && Array.isArray(design.rows) ? design.rows.length : 0;
    return renderGrid(doc, design, card, function (id, cell, cellNode) {
      if (BORDER_IDS.indexOf(id) !== -1) {
        var border = elementBorder(design, id);
        var borderColors = theme && theme.elements ? theme.elements[id] : null;
        var color = borderColors && borderColors.color && borderColors.color !== 'default' ? colorValue(borderColors.color) : 'var(--ssl-sev)';
        var property = 'border' + capitalize(border.side);
        if (options.selectedElement === id) cellNode.classList.add('ssl-element-selected');
        if (coversSide(cell, border.side, rowCount)) {
          card.style[property] = border.thickness + 'px solid ' + color;
          // A column holding only borders stays empty; dropping the card padding on that side keeps the content in place.
          var onlyBorders = cell.elements.every(function (element) { return BORDER_IDS.indexOf(element) !== -1; });
          if (onlyBorders) card.classList.add('ssl-edge-' + border.side);
        } else {
          cellNode.style[property] = border.thickness + 'px solid ' + color;
          cellNode.classList.add('ssl-border-' + border.side);
        }
        return null;
      }
      var value = values[id];
      if ((value === undefined || value === null || value === '') && !options.showEmpty) return null;
      var item = doc.createElement('span');
      item.className = 'ssl-field-' + id + (options.classes && options.classes[id] ? ' ' + options.classes[id] : '');
      item.setAttribute('data-element', id);
      if (options.selectedElement === id) item.classList.add('ssl-element-selected');
      if (options.labels && options.labels[id]) item.title = options.labels[id];
      item.textContent = value === undefined || value === null ? '' : String(value);
      if (id === 'timestamp' && design && design.elementTextStyles && design.elementTextStyles.timestamp
        && design.elementTextStyles.timestamp.wrap === 'words') {
        item.textContent = item.textContent.replace(/[ \t]+/g, '\n');
      }
      var colors = applyText(item, design, theme, id);
      if (colors && colors.background && colors.background !== 'default') {
        item.style.background = colorValue(colors.background);
        item.classList.add('ssl-has-background');
      }
      return item;
    }, options, 'card');
  }

  // The look from before the separator grid: one column with the date centred on the line.
  function defaultSeparatorLayout() {
    return {
      rows: [{
        padding: 0,
        columns: [{ span: UNITS, rowSpan: 1, align: 'center', valign: 'middle', direction: 'horizontal', width: 'span',
          elements: [DAY_SEPARATOR_ID, DAY_SEPARATOR_LINE_ID] }]
      }],
      lineThickness: 1,
      lineStyle: 'solid',
      linePosition: 'behind'
    };
  }

  function separatorLayout(design) {
    var layout = design && design.daySeparatorLayout;
    return layout && Array.isArray(layout.rows) ? layout : defaultSeparatorLayout();
  }

  // linePosition places the line behind the other elements of its cell (at the cell's vertical alignment),
  // or on its own full-width line above or below them.
  // options: selectedElement, selectedSeparator, selectedRow and selectedColumn for the designer preview outline.
  function renderDaySeparator(doc, design, theme, text, options) {
    options = options || {};
    var layout = separatorLayout(design);
    var node = doc.createElement('div');
    node.className = 'ssl-day-separator ssl-grid-card' + (options.selectedSeparator ? ' ssl-preview-selected' : '');
    var thickness = Math.max(1, Math.min(MAX_LINE_THICKNESS, Number(layout.lineThickness) || 1));
    var style = LINE_STYLES.indexOf(layout.lineStyle) === -1 ? 'solid' : layout.lineStyle;
    var position = LINE_POSITIONS.indexOf(layout.linePosition) === -1 ? 'behind' : layout.linePosition;
    // A double line needs at least three pixels to show both lines.
    if (style === 'double') thickness = Math.max(3, thickness);
    return renderGrid(doc, layout, node, function (id, cell, cellNode) {
      var item = doc.createElement('span');
      item.className = 'ssl-field-' + id;
      item.setAttribute('data-element', id);
      if (options.selectedElement === id) item.classList.add('ssl-element-selected');
      if (id === DAY_SEPARATOR_LINE_ID) {
        cellNode.classList.add('ssl-has-line');
        if (position === 'behind') cellNode.style.minHeight = thickness + 'px';
        item.setAttribute('data-position', position);
        var lineColors = theme && theme.elements ? theme.elements[id] : null;
        var color = lineColors && lineColors.color && lineColors.color !== 'default' ? colorValue(lineColors.color) : 'var(--ssl-border)';
        item.style.borderTop = thickness + 'px ' + style + ' ' + color;
        item.setAttribute('aria-hidden', 'true');
        return item;
      }
      item.textContent = text === undefined || text === null ? '' : String(text);
      var colors = applyText(item, design, theme, id);
      if (colors && colors.background && colors.background !== 'default') item.style.background = colorValue(colors.background);
      return item;
    }, options, 'separator');
  }

  function defaultControlLayout(area) {
    var config = CONTROL_AREAS[area];
    return { rows: [{ padding: 0, columns: config.ids.map(function (id, index) {
      return { span: area === 'toolbar' ? (index === 0 ? 4 : 1) : (index === 1 ? 3 : 1),
        rowSpan: 1, align: area === 'paging' && index === 1 ? 'center' : 'left', valign: 'middle',
        direction: 'horizontal', width: id === 'search' || id === 'pageNumber' ? 'span' : 'content', elements: [id] };
    }) }], gap: config.gap };
  }

  function applyControlText(item, design, theme, id) {
    ['font-size', 'font-family', 'text-transform', 'font-weight', 'font-style', 'letter-spacing',
      'line-height', 'color', 'background'].forEach(function (property) { item.style.removeProperty(property); });
    var colors = applyText(item, design, theme, id);
    if (colors && colors.background && colors.background !== 'default') item.style.background = colorValue(colors.background);
  }

  // Moves the existing, already linked controls rather than cloning them, preserving input and Angular state.
  function renderControls(doc, container, area, design, theme, nodes, options) {
    options = options || {};
    var config = CONTROL_AREAS[area];
    var grid = design && design[config.key];
    container.replaceChildren();
    container.classList.remove('ssl-grid-card', 'ssl-grid-spanning', 'ssl-preview-selected');
    container.style.removeProperty('grid-template-columns');
    container.style.removeProperty('column-gap');
    container.style.removeProperty('--ssl-control-gap');
    if (options.selectedPart) container.classList.add('ssl-preview-selected');
    config.ids.forEach(function (id) {
      var node = nodes[id];
      if (!node) return;
      var target = id === 'filter' ? node.querySelector('.ssl-filter-button') : node;
      target.classList.remove('ssl-element-selected');
      applyControlText(target, design, theme, id);
      ['min-height', 'height', 'width', 'padding-left', 'padding-right', 'padding-top', 'padding-bottom',
        'border-radius'].forEach(function (property) { target.style.removeProperty(property); });
      if (options.selectedElement === id) target.classList.add('ssl-element-selected');
      var styles = design && design.controlStyles && design.controlStyles[id];
      if (styles) {
        if (styles.height !== undefined) {
          target.style.minHeight = styles.height + 'px';
          if (id === 'filter') target.style.height = target.style.width = styles.height + 'px';
        }
        if (styles.paddingX !== undefined) target.style.paddingLeft = target.style.paddingRight = styles.paddingX + 'px';
        if (styles.paddingY !== undefined) target.style.paddingTop = target.style.paddingBottom = styles.paddingY + 'px';
        if (styles.radius !== undefined) target.style.borderRadius = styles.radius + 'px';
      }
      if (id === 'filter') {
        var menu = node.querySelector('.ssl-filter-menu');
        if (menu) applyControlText(menu, design, theme, id);
        var icon = target.querySelector('svg');
        var size = design && design.elementSizes && design.elementSizes.filter;
        if (icon) {
          icon.style.width = size ? size + 'px' : '';
          icon.style.height = size ? size + 'px' : '';
        }
      }
    });
    if (!grid) {
      config.ids.forEach(function (id) { if (nodes[id]) container.appendChild(nodes[id]); });
      return container;
    }
    container.classList.add('ssl-grid-card');
    container.style.setProperty('--ssl-control-gap', (grid.gap === undefined ? config.gap : grid.gap) + 'px');
    return renderGrid(doc, grid, container, function (id) { return nodes[id] || null; }, options, area);
  }

  function positionFilterMenu(menu) {
    if (!menu) return;
    var widget = menu.closest('.ssl-widget');
    var bounds = widget.getBoundingClientRect();
    var width = Math.max(0, bounds.width - 20);
    menu.style.minWidth = Math.min(210, width) + 'px';
    menu.style.maxWidth = width + 'px';
    menu.style.right = '0px';
    menu.style.top = '';
    menu.style.bottom = '';
    var rect = menu.getBoundingClientRect();
    var shift = Math.max(bounds.left + 10 - rect.left, Math.min(0, bounds.right - 10 - rect.right));
    menu.style.right = -shift + 'px';
    var below = Math.max(0, bounds.bottom - rect.top - 8);
    var above = Math.max(0, menu.parentElement.getBoundingClientRect().top - bounds.top - 8);
    if (below < menu.scrollHeight && above > below) {
      menu.style.top = 'auto';
      menu.style.bottom = 'calc(100% + 4px)';
      menu.style.maxHeight = above + 'px';
    } else menu.style.maxHeight = below + 'px';
  }

  return {
    CONTROL_AREAS: CONTROL_AREAS,
    CONTROL_IDS: CONTROL_IDS,
    CONTROL_STYLE_LIMITS: CONTROL_STYLE_LIMITS,
    defaultControlLayout: defaultControlLayout,
    renderControls: renderControls,
    applyControlText: applyControlText,
    positionFilterMenu: positionFilterMenu,
    isHexColor: isHexColor,
    colorValue: colorValue,
    widgetStyle: widgetStyle,
    ELEMENT_IDS: ELEMENT_IDS,
    DAY_SEPARATOR_ID: DAY_SEPARATOR_ID,
    DAY_SEPARATOR_LINE_ID: DAY_SEPARATOR_LINE_ID,
    SEPARATOR_ELEMENT_IDS: SEPARATOR_ELEMENT_IDS,
    MAX_SEPARATOR_ROWS: MAX_SEPARATOR_ROWS,
    LINE_STYLES: LINE_STYLES,
    LINE_POSITIONS: LINE_POSITIONS,
    MAX_LINE_THICKNESS: MAX_LINE_THICKNESS,
    BORDER_IDS: BORDER_IDS,
    BORDER_SIDES: BORDER_SIDES,
    CARD_ELEMENT_IDS: CARD_ELEMENT_IDS,
    DEFAULT_BORDER_THICKNESS: DEFAULT_BORDER_THICKNESS,
    elementBorder: elementBorder,
    defaultSeparatorLayout: defaultSeparatorLayout,
    separatorLayout: separatorLayout,
    renderDaySeparator: renderDaySeparator,
    DEFAULT_SIZES: DEFAULT_SIZES,
    FONT_IDS: FONT_IDS,
    TEXT_STYLES: TEXT_STYLES,
    elementFont: elementFont,
    UNITS: UNITS,
    MAX_ROWS: MAX_ROWS,
    computeLayout: computeLayout,
    usedElements: usedElements,
    elementSize: elementSize,
    renderCard: renderCard,
    alignContentTracks: alignContentTracks
  };
}));
