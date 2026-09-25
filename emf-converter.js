// src/emf-color-helpers.ts
function colorRefToHex(r, g, b) {
  const toHex = (v) => v.toString(16).padStart(2, "0");
  return `#${toHex(r & 255)}${toHex(g & 255)}${toHex(b & 255)}`;
}
function readColorRef(view, offset) {
  const r = view.getUint8(offset);
  const g = view.getUint8(offset + 1);
  const b = view.getUint8(offset + 2);
  return colorRefToHex(r, g, b);
}
function argbToRgba(argb) {
  const a = (argb >>> 24 & 255) / 255;
  const r = argb >>> 16 & 255;
  const g = argb >>> 8 & 255;
  const b = argb & 255;
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}
function lerpArgbToRgba(argbA, argbB, t) {
  const tc = Math.min(1, Math.max(0, t));
  const mix = (a2, b2) => Math.round(a2 + (b2 - a2) * tc);
  const aA = argbA >>> 24 & 255;
  const aB = argbB >>> 24 & 255;
  const r = mix(argbA >>> 16 & 255, argbB >>> 16 & 255);
  const g = mix(argbA >>> 8 & 255, argbB >>> 8 & 255);
  const b = mix(argbA & 255, argbB & 255);
  const a = mix(aA, aB) / 255;
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}
function invertCssColor(color) {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const v = parseInt(hex[1], 16);
    const inv = 16777215 ^ v;
    return `#${inv.toString(16).padStart(6, "0")}`;
  }
  const shortHex = /^#([0-9a-f]{3})$/i.exec(color);
  if (shortHex) {
    const [r, g, b] = shortHex[1].split("").map((c) => parseInt(c + c, 16));
    const toHex = (v) => (255 - v).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(color);
  if (rgba) {
    const r = 255 - Math.min(255, parseInt(rgba[1], 10));
    const g = 255 - Math.min(255, parseInt(rgba[2], 10));
    const b = 255 - Math.min(255, parseInt(rgba[3], 10));
    return rgba[4] !== void 0 ? `rgba(${r},${g},${b},${rgba[4]})` : `rgb(${r},${g},${b})`;
  }
  return color;
}

// src/emf-dib-rle-decoder.ts
function decodeRleBitmap(view, bitsOffset, bitsSize, width, height, _topDown, isRle4, colorTable, out, setPixel) {
  let x = 0;
  let y = height - 1;
  let off = bitsOffset;
  const endOff = bitsOffset + bitsSize;
  while (off + 1 < endOff && y >= 0) {
    const first = view.getUint8(off);
    const second = view.getUint8(off + 1);
    off += 2;
    if (first === 0) {
      if (second === 0) {
        x = 0;
        y--;
      } else if (second === 1) {
        break;
      } else if (second === 2) {
        if (off + 1 >= endOff) {
          break;
        }
        x += view.getUint8(off);
        y -= view.getUint8(off + 1);
        off += 2;
      } else {
        const count = second;
        if (!isRle4) {
          for (let i = 0; i < count && off < endOff && x < width; i++) {
            const idx = view.getUint8(off++);
            if (idx < colorTable.length) {
              setPixel(
                x,
                height - 1 - y,
                colorTable[idx][0],
                colorTable[idx][1],
                colorTable[idx][2],
                255
              );
            }
            x++;
          }
          if (count & 1) {
            off++;
          }
        } else {
          const bytes = Math.ceil(count / 2);
          let pi = 0;
          for (let i = 0; i < bytes && off < endOff; i++) {
            const byte = view.getUint8(off++);
            for (let nibble = 0; nibble < 2 && pi < count; nibble++) {
              const idx = nibble === 0 ? byte >> 4 & 15 : byte & 15;
              if (idx < colorTable.length && x < width) {
                setPixel(
                  x,
                  height - 1 - y,
                  colorTable[idx][0],
                  colorTable[idx][1],
                  colorTable[idx][2],
                  255
                );
              }
              x++;
              pi++;
            }
          }
          if (bytes & 1) {
            off++;
          }
        }
      }
    } else if (!isRle4) {
      const idx = second;
      const c = idx < colorTable.length ? colorTable[idx] : [0, 0, 0];
      for (let i = 0; i < first && x < width; i++) {
        setPixel(x, height - 1 - y, c[0], c[1], c[2], 255);
        x++;
      }
    } else {
      const hi = second >> 4 & 15;
      const lo = second & 15;
      for (let i = 0; i < first && x < width; i++) {
        const idx = (i & 1) === 0 ? hi : lo;
        if (idx < colorTable.length) {
          setPixel(
            x,
            height - 1 - y,
            colorTable[idx][0],
            colorTable[idx][1],
            colorTable[idx][2],
            255
          );
        }
        x++;
      }
    }
  }
  return createImageDataCompat(
    new Uint8ClampedArray(out.buffer, out.byteOffset, out.byteLength),
    width,
    height
  );
}

// src/emf-dib-uncompressed.ts
function countTrailingZeros(v) {
  if (v === 0) {
    return 0;
  }
  let c = 0;
  let val = v;
  while ((val & 1) === 0) {
    val >>>= 1;
    c++;
  }
  return c;
}
var BI_BITFIELDS = 3;
function parseBitfieldMasks(view, bmiOffset, headerSize, compression, bitCount) {
  let rMask = 0, gMask = 0, bMask = 0;
  let rShift = 0, gShift = 0, bShift = 0;
  let rMax = 1, gMax = 1, bMax = 1;
  if (compression === BI_BITFIELDS) {
    const bfOff = bmiOffset + headerSize;
    if (bfOff + 12 > view.byteLength) {
      return null;
    }
    rMask = view.getUint32(bfOff, true);
    gMask = view.getUint32(bfOff + 4, true);
    bMask = view.getUint32(bfOff + 8, true);
    rShift = countTrailingZeros(rMask);
    gShift = countTrailingZeros(gMask);
    bShift = countTrailingZeros(bMask);
    rMax = rMask >>> rShift || 1;
    gMax = gMask >>> gShift || 1;
    bMax = bMask >>> bShift || 1;
  } else if (bitCount === 16) {
    rMask = 31744;
    gMask = 992;
    bMask = 31;
    rShift = 10;
    gShift = 5;
    bShift = 0;
    rMax = 31;
    gMax = 31;
    bMax = 31;
  }
  return { rMask, gMask, bMask, rShift, gShift, bShift, rMax, gMax, bMax };
}
function decodeUncompressedRows(view, bitsOffset, width, height, topDown, bitCount, colorTable, masks, out) {
  const rowStride = Math.floor((bitCount * width + 31) / 32) * 4;
  const { rMask, gMask, bMask, rShift, gShift, bShift, rMax, gMax, bMax } = masks;
  for (let y = 0; y < height; y++) {
    const srcY = topDown ? y : height - 1 - y;
    const rowStart = bitsOffset + srcY * rowStride;
    if (rowStart + rowStride > view.byteLength) {
      continue;
    }
    for (let x = 0; x < width; x++) {
      const dstPx = (y * width + x) * 4;
      if (bitCount === 1) {
        const byteIdx = rowStart + (x >> 3);
        const bit = view.getUint8(byteIdx) >> 7 - (x & 7) & 1;
        if (bit < colorTable.length) {
          out[dstPx] = colorTable[bit][0];
          out[dstPx + 1] = colorTable[bit][1];
          out[dstPx + 2] = colorTable[bit][2];
        }
        out[dstPx + 3] = 255;
      } else if (bitCount === 4) {
        const byteIdx = rowStart + (x >> 1);
        const nibble = (x & 1) === 0 ? view.getUint8(byteIdx) >> 4 & 15 : view.getUint8(byteIdx) & 15;
        if (nibble < colorTable.length) {
          out[dstPx] = colorTable[nibble][0];
          out[dstPx + 1] = colorTable[nibble][1];
          out[dstPx + 2] = colorTable[nibble][2];
        }
        out[dstPx + 3] = 255;
      } else if (bitCount === 8) {
        const idx = view.getUint8(rowStart + x);
        if (idx < colorTable.length) {
          out[dstPx] = colorTable[idx][0];
          out[dstPx + 1] = colorTable[idx][1];
          out[dstPx + 2] = colorTable[idx][2];
        }
        out[dstPx + 3] = 255;
      } else if (bitCount === 16) {
        const val = view.getUint16(rowStart + x * 2, true);
        out[dstPx] = Math.round(((val & rMask) >>> rShift) * 255 / rMax);
        out[dstPx + 1] = Math.round(((val & gMask) >>> gShift) * 255 / gMax);
        out[dstPx + 2] = Math.round(((val & bMask) >>> bShift) * 255 / bMax);
        out[dstPx + 3] = 255;
      } else if (bitCount === 24) {
        const srcPx = rowStart + x * 3;
        out[dstPx] = view.getUint8(srcPx + 2);
        out[dstPx + 1] = view.getUint8(srcPx + 1);
        out[dstPx + 2] = view.getUint8(srcPx);
        out[dstPx + 3] = 255;
      } else {
        const srcPx = rowStart + x * 4;
        const bb = view.getUint8(srcPx);
        const gg = view.getUint8(srcPx + 1);
        const rr = view.getUint8(srcPx + 2);
        const aa = view.getUint8(srcPx + 3);
        out[dstPx] = rr;
        out[dstPx + 1] = gg;
        out[dstPx + 2] = bb;
        out[dstPx + 3] = aa === 0 ? 255 : aa;
      }
    }
  }
}

// src/emf-dib-decoder.ts
function decodeDibToImageData(view, bmiOffset, bitsOffset, bitsSize) {
  if (bmiOffset < 0 || bitsOffset < 0 || bmiOffset + 40 > view.byteLength || bitsOffset + bitsSize > view.byteLength) {
    return null;
  }
  const headerSize = view.getUint32(bmiOffset, true);
  if (headerSize < 40 || bmiOffset + headerSize > view.byteLength) {
    return null;
  }
  const width = view.getInt32(bmiOffset + 4, true);
  const heightRaw = view.getInt32(bmiOffset + 8, true);
  const planes = view.getUint16(bmiOffset + 12, true);
  const bitCount = view.getUint16(bmiOffset + 14, true);
  const compression = view.getUint32(bmiOffset + 16, true);
  if (planes !== 1 || width <= 0 || heightRaw === 0) {
    return null;
  }
  if (width > 8192 || Math.abs(heightRaw) > 8192) {
    return null;
  }
  const BI_RGB = 0;
  const BI_RLE8 = 1;
  const BI_RLE4 = 2;
  const BI_BITFIELDS2 = 3;
  if (bitCount !== 1 && bitCount !== 4 && bitCount !== 8 && bitCount !== 16 && bitCount !== 24 && bitCount !== 32) {
    return null;
  }
  if (compression === BI_RLE8 && bitCount !== 8) {
    return null;
  }
  if (compression === BI_RLE4 && bitCount !== 4) {
    return null;
  }
  if (compression === BI_BITFIELDS2 && bitCount !== 16 && bitCount !== 32) {
    return null;
  }
  if (compression !== BI_RGB && compression !== BI_RLE8 && compression !== BI_RLE4 && compression !== BI_BITFIELDS2) {
    return null;
  }
  const height = Math.abs(heightRaw);
  const topDown = heightRaw < 0;
  const colorTable = [];
  if (bitCount <= 8) {
    const maxColors = 1 << bitCount;
    const colorsUsed = view.getUint32(bmiOffset + 32, true) || maxColors;
    const numColors = Math.min(colorsUsed, maxColors);
    const ctOffset = bmiOffset + headerSize;
    if (ctOffset + numColors * 4 > view.byteLength) {
      return null;
    }
    for (let i = 0; i < numColors; i++) {
      const b = view.getUint8(ctOffset + i * 4);
      const g = view.getUint8(ctOffset + i * 4 + 1);
      const r = view.getUint8(ctOffset + i * 4 + 2);
      colorTable.push([r, g, b]);
    }
  }
  const masks = parseBitfieldMasks(view, bmiOffset, headerSize, compression, bitCount);
  if (!masks) {
    return null;
  }
  const out = new Uint8ClampedArray(width * height * 4);
  if (compression === BI_RLE8 || compression === BI_RLE4) {
    const setPixel = (x, y, r, g, b, a) => {
      const dstPx = (y * width + x) * 4;
      out[dstPx] = r;
      out[dstPx + 1] = g;
      out[dstPx + 2] = b;
      out[dstPx + 3] = a;
    };
    return decodeRleBitmap(
      view,
      bitsOffset,
      bitsSize,
      width,
      height,
      topDown,
      compression === BI_RLE4,
      colorTable,
      out,
      setPixel
    );
  }
  decodeUncompressedRows(
    view,
    bitsOffset,
    width,
    height,
    topDown,
    bitCount,
    colorTable,
    masks,
    out
  );
  return createImageDataCompat(out, width, height);
}

// src/emf-gdi-brush-pattern.ts
var HATCH_ROWS = [
  [0, 0, 0, 255, 0, 0, 0, 0],
  // HS_HORIZONTAL
  [8, 8, 8, 8, 8, 8, 8, 8],
  // HS_VERTICAL
  [128, 64, 32, 16, 8, 4, 2, 1],
  // HS_FDIAGONAL
  [1, 2, 4, 8, 16, 32, 64, 128],
  // HS_BDIAGONAL
  [8, 8, 8, 255, 8, 8, 8, 8],
  // HS_CROSS
  [129, 66, 36, 24, 24, 36, 66, 129]
  // HS_DIAGCROSS
];
function hatchBit(hatch, x, y) {
  const rows = HATCH_ROWS[hatch] ?? HATCH_ROWS[0];
  return (rows[y & 7] >> 7 - (x & 7) & 1) === 1;
}
function cssHexToRgb(color) {
  const m = /^#([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(color.trim());
  if (!m) {
    return 0;
  }
  const hex = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  return parseInt(hex, 16);
}
function decodeMonoBits(view, bmiOffset, bitsOffset) {
  if (bmiOffset + 16 > view.byteLength) {
    return null;
  }
  const width = view.getInt32(bmiOffset + 4, true);
  const heightRaw = view.getInt32(bmiOffset + 8, true);
  const bitCount = view.getUint16(bmiOffset + 14, true);
  const height = Math.abs(heightRaw);
  if (bitCount !== 1 || width <= 0 || height === 0 || width > 256 || height > 256) {
    return null;
  }
  const stride = (width + 31 >> 5) * 4;
  if (bitsOffset + stride * height > view.byteLength) {
    return null;
  }
  const bits = new Uint8Array(width * height);
  for (let row = 0; row < height; row++) {
    const y = heightRaw > 0 ? height - 1 - row : row;
    const rowOff = bitsOffset + row * stride;
    for (let x = 0; x < width; x++) {
      bits[y * width + x] = view.getUint8(rowOff + (x >> 3)) >> 7 - (x & 7) & 1;
    }
  }
  return { width, height, bits };
}
function parsePatternBrush(view, offset, dataOff, mono) {
  if (dataOff + 24 > view.byteLength) {
    return null;
  }
  const offBmi = view.getUint32(dataOff + 8, true);
  const offBits = view.getUint32(dataOff + 16, true);
  const cbBits = view.getUint32(dataOff + 20, true);
  const bmi = offset + offBmi;
  const bitsAt = offset + offBits;
  const bitCount = bmi + 16 <= view.byteLength ? view.getUint16(bmi + 14, true) : 0;
  if (mono || bitCount === 1) {
    const decoded = decodeMonoBits(view, bmi, bitsAt);
    if (decoded && mono) {
      return { kind: "mono", ...decoded };
    }
  }
  const image = decodeDibToImageData(view, bmi, bitsAt, cbBits);
  if (!image) {
    return null;
  }
  const rgb = new Uint32Array(image.width * image.height);
  const d = image.data;
  for (let i = 0; i < rgb.length; i++) {
    rgb[i] = d[i * 4] << 16 | d[i * 4 + 1] << 8 | d[i * 4 + 2];
  }
  return { kind: "bitmap", width: image.width, height: image.height, rgb };
}
function realizeBrush(state) {
  if (state.brushStyle === 1) {
    return { kind: "none" };
  }
  const pattern = state.brushPattern;
  if (!pattern) {
    return { kind: "solid", rgb: cssHexToRgb(state.brushColor) };
  }
  if (pattern.kind === "bitmap") {
    return { kind: "tile", width: pattern.width, height: pattern.height, rgb: pattern.rgb };
  }
  const bk = cssHexToRgb(state.bkColor);
  if (pattern.kind === "hatch") {
    const fg = cssHexToRgb(state.brushColor);
    const rgb2 = new Uint32Array(64);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        rgb2[y * 8 + x] = hatchBit(pattern.hatch, x, y) ? fg : bk;
      }
    }
    return { kind: "tile", width: 8, height: 8, rgb: rgb2 };
  }
  const text = cssHexToRgb(state.textColor);
  const rgb = new Uint32Array(pattern.width * pattern.height);
  for (let i = 0; i < rgb.length; i++) {
    rgb[i] = pattern.bits[i] ? bk : text;
  }
  return { kind: "tile", width: pattern.width, height: pattern.height, rgb };
}
function sampleTile(tile, devX, devY, orgX, orgY) {
  const tx = ((devX - orgX) % tile.width + tile.width) % tile.width;
  const ty = ((devY - orgY) % tile.height + tile.height) % tile.height;
  return tile.rgb[ty * tile.width + tx];
}

// src/emf-gdi-text-layout.ts
function cumulativeGlyphOffsets(dx) {
  const offsets = [];
  let acc = 0;
  for (let i = 0; i < dx.length; i++) {
    offsets.push(acc);
    acc += dx[i];
  }
  return offsets;
}
function totalGlyphAdvance(dx) {
  let sum = 0;
  for (const d of dx) {
    sum += d;
  }
  return sum;
}
function alignmentStartOffset(totalWidth, align) {
  if (align === "center") {
    return -totalWidth / 2;
  }
  if (align === "right") {
    return -totalWidth;
  }
  return 0;
}
var DEG_TO_RAD = Math.PI / 180;
function escapementToCanvasRadians(tenthsOfDegree) {
  return -(tenthsOfDegree / 10) * DEG_TO_RAD;
}
var CELL_TO_CHAR_HEIGHT_RATIO = 1.15;
function resolveFontPixelHeight(lfHeight) {
  if (lfHeight === 0) {
    return 0;
  }
  if (lfHeight < 0) {
    return -lfHeight;
  }
  return lfHeight / CELL_TO_CHAR_HEIGHT_RATIO;
}

// src/emf-constants.ts
var EMR_HEADER = 1;
var EMR_POLYBEZIER = 2;
var EMR_POLYGON = 3;
var EMR_POLYLINE = 4;
var EMR_POLYBEZIERTO = 5;
var EMR_POLYLINETO = 6;
var EMR_POLYPOLYLINE = 7;
var EMR_POLYPOLYGON = 8;
var EMR_SETWINDOWEXTEX = 9;
var EMR_SETWINDOWORGEX = 10;
var EMR_SETVIEWPORTEXTEX = 11;
var EMR_SETVIEWPORTORGEX = 12;
var EMR_SETBRUSHORGEX = 13;
var EMR_CREATEMONOBRUSH = 93;
var EMR_CREATEDIBPATTERNBRUSHPT = 94;
var EMR_STRETCHBLT = 77;
var EMR_EOF = 14;
var EMR_SETPIXELV = 15;
var EMR_SETMAPMODE = 17;
var EMR_SETBKMODE = 18;
var EMR_SETPOLYFILLMODE = 19;
var EMR_SETROP2 = 20;
var EMR_SETSTRETCHBLTMODE = 21;
var R2_BLACK = 1;
var R2_NOTMERGEPEN = 2;
var R2_MASKNOTPEN = 3;
var R2_NOTCOPYPEN = 4;
var R2_MASKPENNOT = 5;
var R2_NOT = 6;
var R2_XORPEN = 7;
var R2_NOTMASKPEN = 8;
var R2_MASKPEN = 9;
var R2_NOTXORPEN = 10;
var R2_NOP = 11;
var R2_MERGENOTPEN = 12;
var R2_MERGEPENNOT = 14;
var R2_MERGEPEN = 15;
var R2_WHITE = 16;
var MAX_CANVAS_DIMENSION = 8192;
var MAX_RECORDS_DEFAULT = 2e5;
var MAX_RECORDS_EMFPLUS_DEFAULT = 5e5;
var EMR_SETTEXTALIGN = 22;
var EMR_SETTEXTCOLOR = 24;
var EMR_SETBKCOLOR = 25;
var EMR_OFFSETCLIPRGN = 26;
var EMR_MOVETOEX = 27;
var EMR_SETMETARGN = 28;
var EMR_EXCLUDECLIPRECT = 29;
var EMR_INTERSECTCLIPRECT = 30;
var EMR_SCALEVIEWPORTEXTEX = 31;
var EMR_SCALEWINDOWEXTEX = 32;
var EMR_SAVEDC = 33;
var EMR_RESTOREDC = 34;
var EMR_SETWORLDTRANSFORM = 35;
var EMR_MODIFYWORLDTRANSFORM = 36;
var EMR_SELECTOBJECT = 37;
var EMR_CREATEPEN = 38;
var EMR_CREATEBRUSHINDIRECT = 39;
var EMR_DELETEOBJECT = 40;
var EMR_ELLIPSE = 42;
var EMR_RECTANGLE = 43;
var EMR_ROUNDRECT = 44;
var EMR_ARC = 45;
var EMR_CHORD = 46;
var EMR_PIE = 47;
var EMR_LINETO = 54;
var EMR_ARCTO = 55;
var EMR_SETMITERLIMIT = 58;
var EMR_BEGINPATH = 59;
var EMR_ENDPATH = 60;
var EMR_CLOSEFIGURE = 61;
var EMR_FILLPATH = 62;
var EMR_STROKEANDFILLPATH = 63;
var EMR_STROKEPATH = 64;
var EMR_SELECTCLIPPATH = 67;
var EMR_COMMENT = 70;
var EMR_EXTSELECTCLIPRGN = 75;
var EMR_BITBLT = 76;
var EMR_STRETCHDIBITS = 81;
var EMR_EXTCREATEFONTINDIRECTW = 82;
var EMR_EXTTEXTOUTW = 84;
var EMR_POLYBEZIER16 = 85;
var EMR_POLYGON16 = 86;
var EMR_POLYLINE16 = 87;
var EMR_POLYBEZIERTO16 = 88;
var EMR_POLYLINETO16 = 89;
var EMR_POLYPOLYGON16 = 91;
var EMR_EXTCREATEPEN = 95;
var EMR_SETICMMODE = 98;
var EMR_SETLAYOUT = 115;
var STOCK_OBJECT_BASE = 2147483648;
var EMFPLUS_SIGNATURE = 726027589;
var EMR_COMMENT_PUBLIC_SIGNATURE = 1128875079;
var EMFPLUS_HEADER = 16385;
var EMFPLUS_ENDOFFILE = 16386;
var EMFPLUS_GETDC = 16388;
var EMFPLUS_OBJECT = 16392;
var EMFPLUS_FILLRECTS = 16394;
var EMFPLUS_DRAWRECTS = 16395;
var EMFPLUS_FILLPOLYGON = 16396;
var EMFPLUS_DRAWLINES = 16397;
var EMFPLUS_FILLELLIPSE = 16398;
var EMFPLUS_DRAWELLIPSE = 16399;
var EMFPLUS_FILLPIE = 16400;
var EMFPLUS_DRAWPIE = 16401;
var EMFPLUS_DRAWARC = 16402;
var EMFPLUS_FILLPATH = 16404;
var EMFPLUS_DRAWPATH = 16405;
var EMFPLUS_DRAWIMAGE = 16410;
var EMFPLUS_DRAWIMAGEPOINTS = 16411;
var EMFPLUS_DRAWSTRING = 16412;
var EMFPLUS_SETANTIALIASMODE = 16414;
var EMFPLUS_SETTEXTRENDERINGHINT = 16415;
var EMFPLUS_SETINTERPOLATIONMODE = 16417;
var EMFPLUS_SETPIXELOFFSETMODE = 16418;
var EMFPLUS_SETCOMPOSITINGQUALITY = 16420;
var EMFPLUS_SAVE = 16421;
var EMFPLUS_RESTORE = 16422;
var EMFPLUS_BEGINCONTAINERNOPARAMS = 16424;
var EMFPLUS_ENDCONTAINER = 16425;
var EMFPLUS_SETWORLDTRANSFORM = 16426;
var EMFPLUS_RESETWORLDTRANSFORM = 16427;
var EMFPLUS_MULTIPLYWORLDTRANSFORM = 16428;
var EMFPLUS_TRANSLATEWORLDTRANSFORM = 16429;
var EMFPLUS_SCALEWORLDTRANSFORM = 16430;
var EMFPLUS_ROTATEWORLDTRANSFORM = 16431;
var EMFPLUS_SETPAGETRANSFORM = 16432;
var EMFPLUS_RESETCLIP = 16433;
var EMFPLUS_SETCLIPRECT = 16434;
var EMFPLUS_SETCLIPPATH = 16435;
var EMFPLUS_SETCLIPREGION = 16436;
var EMFPLUS_DRAWDRIVERSTRING = 16438;
var EMFPLUS_OFFSETCLIP = 16437;
var EMFPLUS_OBJECTTYPE_BRUSH = 1;
var EMFPLUS_OBJECTTYPE_PEN = 2;
var EMFPLUS_OBJECTTYPE_PATH = 3;
var EMFPLUS_OBJECTTYPE_IMAGEATTRIBUTES = 4;
var EMFPLUS_OBJECTTYPE_IMAGE = 5;
var EMFPLUS_OBJECTTYPE_FONT = 6;
var EMFPLUS_OBJECTTYPE_STRINGFORMAT = 7;
var EMFPLUS_OBJECTTYPE_REGION = 8;
var EMFPLUS_BRUSHTYPE_SOLID = 0;
var EMFPLUS_BRUSHTYPE_HATCHFILL = 1;
var EMFPLUS_BRUSHTYPE_TEXTUREFILL = 2;
var EMFPLUS_BRUSHTYPE_PATHGRADIENT = 3;
var EMFPLUS_BRUSHTYPE_LINEARGRADIENT = 4;
var META_EOF = 0;
var META_SETBKCOLOR = 513;
var META_SETBKMODE = 258;
var META_SETROP2 = 260;
var META_SETPOLYFILLMODE = 262;
var META_SETTEXTCOLOR = 521;
var META_SETTEXTALIGN = 302;
var META_SETWINDOWORG = 523;
var META_SETWINDOWEXT = 524;
var META_MOVETO = 532;
var META_LINETO = 531;
var META_RECTANGLE = 1051;
var META_ROUNDRECT = 1564;
var META_ELLIPSE = 1048;
var META_ARC = 2071;
var META_PIE = 2074;
var META_CHORD = 2096;
var META_POLYGON = 804;
var META_POLYLINE = 805;
var META_SELECTOBJECT = 301;
var META_DELETEOBJECT = 496;
var META_CREATEPENINDIRECT = 762;
var META_CREATEBRUSHINDIRECT = 764;
var META_CREATEFONTINDIRECT = 763;
var META_TEXTOUT = 1313;
var META_EXTTEXTOUT = 2610;
var META_SAVEDC = 30;
var META_RESTOREDC = 295;
var META_POLYPOLYGON = 1336;
var emfLog = (...args) => {
};
var emfWarn = (...args) => {
};

// src/emf-canvas-helpers.ts
var nodeCanvasModule;
async function ensureNodeCanvasModule() {
  if (nodeCanvasModule !== void 0) {
    return nodeCanvasModule;
  }
  if (typeof OffscreenCanvas !== "undefined" || typeof document !== "undefined") {
    nodeCanvasModule = null;
    return nodeCanvasModule;
  }
  if (typeof process === "undefined" || !process.versions?.node) {
    nodeCanvasModule = null;
    return nodeCanvasModule;
  }
  try {
    nodeCanvasModule = await import(
      /* webpackIgnore: true */
      /* @vite-ignore */
      '@napi-rs/canvas'
    );
  } catch {
    nodeCanvasModule = null;
  }
  return nodeCanvasModule;
}
var DEFAULT_DPI_SCALE = 1;
function createCanvas(width, height, maxWidth, maxHeight, dpiScale = DEFAULT_DPI_SCALE, maxCanvasDimension = MAX_CANVAS_DIMENSION) {
  const effectiveScale = Math.max(1, Math.min(dpiScale, 4));
  let w = Math.round(width * effectiveScale);
  let h = Math.round(height * effectiveScale);
  let scaleX = effectiveScale;
  let scaleY = effectiveScale;
  if (maxWidth && w > maxWidth) {
    const factor = maxWidth / w;
    w = maxWidth;
    h = Math.round(h * factor);
    scaleX *= factor;
    scaleY *= factor;
  }
  if (maxHeight && h > maxHeight) {
    const factor = maxHeight / h;
    w = Math.round(w * factor);
    h = maxHeight;
    scaleX *= factor;
    scaleY *= factor;
  }
  const dimCap = Math.max(1, Math.floor(maxCanvasDimension));
  const clampedW = Math.max(1, Math.min(w, dimCap));
  const clampedH = Math.max(1, Math.min(h, dimCap));
  if (clampedW !== w || clampedH !== h) {
    console.warn(
      `[emf-converter] Canvas size clamped from ${w}\xD7${h} to ${clampedW}\xD7${clampedH}. Output may lose detail.`
    );
  }
  w = clampedW;
  h = clampedH;
  try {
    if (typeof OffscreenCanvas !== "undefined") {
      emfLog(
        `createCanvas: using OffscreenCanvas ${w}\xD7${h}, scale=(${scaleX.toFixed(3)},${scaleY.toFixed(3)})`
      );
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        emfWarn('createCanvas: OffscreenCanvas.getContext("2d") returned null');
        return null;
      }
      return { canvas, ctx, scaleX, scaleY };
    }
    if (typeof document !== "undefined") {
      emfLog(
        `createCanvas: using HTMLCanvasElement ${w}\xD7${h}, scale=(${scaleX.toFixed(3)},${scaleY.toFixed(3)})`
      );
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        emfWarn('createCanvas: HTMLCanvasElement.getContext("2d") returned null');
        return null;
      }
      return { canvas, ctx, scaleX, scaleY };
    }
    if (nodeCanvasModule) {
      emfLog(
        `createCanvas: using @napi-rs/canvas ${w}\xD7${h}, scale=(${scaleX.toFixed(3)},${scaleY.toFixed(3)})`
      );
      const canvas = nodeCanvasModule.createCanvas(w, h);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        emfWarn('createCanvas: @napi-rs/canvas getContext("2d") returned null');
        return null;
      }
      return { canvas, ctx, scaleX, scaleY };
    }
    emfWarn(
      "createCanvas: no OffscreenCanvas, no document, and no @napi-rs/canvas, cannot create canvas"
    );
    return null;
  } catch (err) {
    return null;
  }
}
function createTempCanvas(width, height) {
  if (width <= 0 || height <= 0) {
    return null;
  }
  width = Math.max(1, Math.min(Math.floor(width), MAX_CANVAS_DIMENSION));
  height = Math.max(1, Math.min(Math.floor(height), MAX_CANVAS_DIMENSION));
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }
    return { canvas, ctx };
  }
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }
    return { canvas, ctx };
  }
  if (nodeCanvasModule) {
    const canvas = nodeCanvasModule.createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }
    return { canvas, ctx };
  }
  return null;
}
function rop2Paint(rop2) {
  switch (rop2) {
    case R2_BLACK:
      return { gco: "source-over", colorTransform: "black", exact: true };
    case R2_WHITE:
      return { gco: "source-over", colorTransform: "white", exact: true };
    case R2_NOP:
      return { gco: "source-over", colorTransform: "skip", exact: true };
    case R2_NOTCOPYPEN:
      return { gco: "source-over", colorTransform: "invert", exact: true };
    case R2_NOT:
      return { gco: "difference", colorTransform: "white", exact: true };
    case R2_XORPEN:
    case R2_MASKPENNOT:
      return { gco: "difference", colorTransform: "none", exact: false };
    case R2_NOTXORPEN:
      return { gco: "difference", colorTransform: "invert", exact: false };
    case R2_MASKPEN:
      return { gco: "darken", colorTransform: "none", exact: false };
    case R2_MASKNOTPEN:
    case R2_NOTMERGEPEN:
      return { gco: "darken", colorTransform: "invert", exact: false };
    case R2_MERGEPEN:
    case R2_MERGEPENNOT:
      return { gco: "lighten", colorTransform: "none", exact: false };
    case R2_MERGENOTPEN:
    case R2_NOTMASKPEN:
      return { gco: "lighten", colorTransform: "invert", exact: false };
    default:
      return { gco: "source-over", colorTransform: "none", exact: true };
  }
}
function rop2TransformColor(color, transform) {
  switch (transform) {
    case "invert":
      return invertCssColor(color);
    case "black":
      return "#000000";
    case "white":
      return "#ffffff";
    case "skip":
      return "rgba(0,0,0,0)";
    default:
      return color;
  }
}
function applyPen(ctx, state) {
  const paint = rop2Paint(state.rop2);
  ctx.globalCompositeOperation = paint.gco;
  if (state.penStyle === 5) {
    ctx.strokeStyle = "rgba(0,0,0,0)";
    ctx.lineWidth = 0;
    return;
  }
  ctx.strokeStyle = rop2TransformColor(state.penColor, paint.colorTransform);
  ctx.lineWidth = Math.max(state.penWidth, 1);
  switch (state.penStyle) {
    case 1:
      ctx.setLineDash([8, 4]);
      break;
    case 2:
      ctx.setLineDash([2, 2]);
      break;
    case 3:
      ctx.setLineDash([8, 4, 2, 4]);
      break;
    case 4:
      ctx.setLineDash([8, 4, 2, 4, 2, 4]);
      break;
    default:
      ctx.setLineDash([]);
      break;
  }
}
function applyBrush(ctx, state) {
  const paint = rop2Paint(state.rop2);
  ctx.globalCompositeOperation = paint.gco;
  const realized = realizeBrush(state);
  if (realized.kind === "none") {
    ctx.fillStyle = "rgba(0,0,0,0)";
    return;
  }
  ctx.fillStyle = rop2TransformColor(state.brushColor, paint.colorTransform);
}
function cssFontWeight(weight) {
  if (!weight || weight === 400) {
    return "";
  }
  const rounded = Math.round(weight / 100) * 100;
  if (rounded === 700) {
    return "bold";
  }
  if (rounded >= 100 && rounded <= 900) {
    return String(rounded);
  }
  return weight >= 700 ? "bold" : "";
}
function mapFontFamily(face, map) {
  const resolved = map?.[face.toLowerCase().trim()] ?? face;
  if (/[\s,]/.test(resolved) && !/^["']/.test(resolved)) {
    return `"${resolved}"`;
  }
  return resolved;
}
function fontSizePx(state, scale = 1) {
  return Math.max(resolveFontPixelHeight(state.fontHeight) * Math.abs(scale || 1), 8);
}
function applyFont(ctx, state, scale = 1) {
  const italic = state.fontItalic ? "italic " : "";
  const weight = cssFontWeight(state.fontWeight);
  const weightPart = weight ? `${weight} ` : "";
  const size = fontSizePx(state, scale);
  const family = mapFontFamily(state.fontFamily, state.fontFamilyMap);
  ctx.font = `${italic}${weightPart}${size}px ${family}`;
}
function drawTextDecorations(ctx, state, x, y, width, scale = 1) {
  if (!state.fontUnderline && !state.fontStrikeOut) {
    return;
  }
  const size = fontSizePx(state, scale);
  const thickness = Math.max(1, Math.round(size / 14));
  const prevFill = ctx.fillStyle;
  ctx.fillStyle = state.textColor;
  if (state.fontUnderline) {
    ctx.fillRect(x, y + Math.round(size * 0.12), width, thickness);
  }
  if (state.fontStrikeOut) {
    ctx.fillRect(x, y - Math.round(size * 0.3), width, thickness);
  }
  ctx.fillStyle = prevFill;
}
function readUtf16LE(view, offset, charCount) {
  if (charCount <= 0) {
    return "";
  }
  const maxBytes = view.byteLength - offset;
  if (maxBytes <= 0) {
    return "";
  }
  const usableChars = Math.min(charCount, Math.floor(maxBytes / 2));
  if (usableChars <= 0) {
    return "";
  }
  let decoded;
  try {
    const bytes = new Uint8Array(view.buffer, view.byteOffset + offset, usableChars * 2);
    decoded = new TextDecoder("utf-16le").decode(bytes);
  } catch {
    const chars = [];
    for (let i = 0; i < usableChars; i++) {
      const code = view.getUint16(offset + i * 2, true);
      if (code === 0) {
        return chars.join("");
      }
      chars.push(String.fromCharCode(code));
    }
    return chars.join("");
  }
  const nul = decoded.indexOf(String.fromCharCode(0));
  return nul === -1 ? decoded : decoded.slice(0, nul);
}
function getStockObject(index) {
  switch (index) {
    case 0:
      return { kind: "brush", style: 0, color: "#ffffff" };
    case 1:
      return { kind: "brush", style: 0, color: "#c0c0c0" };
    case 2:
      return { kind: "brush", style: 0, color: "#808080" };
    case 3:
      return { kind: "brush", style: 0, color: "#404040" };
    case 4:
      return { kind: "brush", style: 0, color: "#000000" };
    case 5:
      return { kind: "brush", style: 1, color: "#000000" };
    case 6:
      return { kind: "pen", style: 0, widthX: 1, color: "#ffffff" };
    case 7:
      return { kind: "pen", style: 0, widthX: 1, color: "#000000" };
    case 8:
      return { kind: "pen", style: 5, widthX: 0, color: "#000000" };
    case 10:
    case 11:
      return {
        kind: "font",
        height: 12,
        weight: 400,
        italic: false,
        underline: false,
        strikeOut: false,
        family: "monospace"
      };
    case 12:
    case 13:
    case 14:
    case 17:
      return {
        kind: "font",
        height: 12,
        weight: 400,
        italic: false,
        underline: false,
        strikeOut: false,
        family: "sans-serif"
      };
    default:
      return null;
  }
}
async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
async function exportCanvasToPngDataUrl(canvas) {
  if (typeof OffscreenCanvas !== "undefined" && canvas instanceof OffscreenCanvas) {
    emfLog(
      `exportCanvasToPngDataUrl: using OffscreenCanvas.convertToBlob (${canvas.width}\xD7${canvas.height})`
    );
    const blob = await canvas.convertToBlob({ type: "image/png" });
    emfLog(`exportCanvasToPngDataUrl: blob size=${blob.size} bytes, type=${blob.type}`);
    return blobToDataUrl(blob);
  }
  if (typeof HTMLCanvasElement !== "undefined" && canvas instanceof HTMLCanvasElement) {
    emfLog(
      `exportCanvasToPngDataUrl: using HTMLCanvasElement.toDataURL (${canvas.width}\xD7${canvas.height})`
    );
    return canvas.toDataURL("image/png");
  }
  if (nodeCanvasModule && canvas instanceof nodeCanvasModule.Canvas) {
    emfLog(
      `exportCanvasToPngDataUrl: using @napi-rs/canvas toDataURLAsync (${canvas.width}\xD7${canvas.height})`
    );
    return canvas.toDataURLAsync();
  }
  return null;
}
async function decodeDeferredImageBytes(bytes, mime) {
  if (nodeCanvasModule) {
    const image = await nodeCanvasModule.loadImage(new Uint8Array(bytes));
    return { drawable: image, width: image.width, height: image.height, close: () => {
    } };
  }
  if (typeof createImageBitmap !== "function") {
    return null;
  }
  const blob = mime !== void 0 ? new Blob([bytes], { type: mime }) : new Blob([bytes]);
  const bitmap = await createImageBitmap(blob);
  return { drawable: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
}
function canvasDrawImage(ctx, image, dx, dy, dw, dh) {
  const draw = ctx.drawImage;
  draw.call(ctx, image, dx, dy, dw, dh);
}
function canvasGetImageData(ctx, x, y, w, h) {
  const get = ctx.getImageData;
  return get.call(ctx, x, y, w, h);
}
function canvasPutImageData(ctx, data, x, y) {
  const put = ctx.putImageData;
  put.call(ctx, data, x, y);
}
function canvasCreatePattern(ctx, image, repetition) {
  const create = ctx.createPattern;
  return create.call(ctx, image, repetition);
}
function createImageDataCompat(data, width, height) {
  if (typeof ImageData !== "undefined") {
    return new ImageData(data, width, height);
  }
  if (nodeCanvasModule) {
    const Ctor = nodeCanvasModule.ImageData;
    return new Ctor(data, width, height);
  }
  throw new ReferenceError("ImageData is not defined");
}

// src/emf-header-parser.ts
function parseEmfHeader(view) {
  emfLog("parseEmfHeader: byteLength =", view.byteLength);
  if (view.byteLength < 88) {
    return null;
  }
  const recordType = view.getUint32(0, true);
  if (recordType !== EMR_HEADER) {
    return null;
  }
  const boundsLeft = view.getInt32(8, true);
  const boundsTop = view.getInt32(12, true);
  const boundsRight = view.getInt32(16, true);
  const boundsBottom = view.getInt32(20, true);
  const frameLeft = view.getInt32(24, true);
  const frameTop = view.getInt32(28, true);
  const frameRight = view.getInt32(32, true);
  const frameBottom = view.getInt32(36, true);
  const frameW = frameRight - frameLeft;
  const frameH = frameBottom - frameTop;
  return {
    bounds: {
      left: boundsLeft,
      top: boundsTop,
      right: boundsRight,
      bottom: boundsBottom
    },
    frameW,
    frameH
  };
}
function getRenderableEmfBounds(header) {
  const boundsW = header.bounds.right - header.bounds.left;
  const boundsH = header.bounds.bottom - header.bounds.top;
  if (boundsW > 0 && boundsH > 0) {
    return header.bounds;
  }
  if (header.frameW > 0 && header.frameH > 0) {
    emfLog(
      `getRenderableEmfBounds: bounds invalid (${boundsW}\xD7${boundsH}), falling back to frame ${header.frameW}\xD7${header.frameH}`
    );
    return { left: 0, top: 0, right: header.frameW, bottom: header.frameH };
  }
  return null;
}
function parseWmfHeader(view) {
  if (view.byteLength < 22) {
    return null;
  }
  const magic = view.getUint32(0, true);
  let headerOffset = 0;
  let boundsLeft = 0;
  let boundsTop = 0;
  let boundsRight = 800;
  let boundsBottom = 600;
  let unitsPerInch = 96;
  if (magic === 2596720087) {
    boundsLeft = view.getInt16(6, true);
    boundsTop = view.getInt16(8, true);
    boundsRight = view.getInt16(10, true);
    boundsBottom = view.getInt16(12, true);
    unitsPerInch = view.getUint16(14, true) || 96;
    headerOffset = 22;
  }
  if (headerOffset + 18 > view.byteLength) {
    return null;
  }
  const fileType = view.getUint16(headerOffset, true);
  if (fileType !== 1 && fileType !== 2) {
    return null;
  }
  const headerSize = view.getUint16(headerOffset + 2, true) * 2;
  const maxRecordSize = view.getUint32(headerOffset + 8, true) * 2;
  return {
    headerSize: headerOffset + headerSize,
    maxRecordSize,
    boundsLeft,
    boundsTop,
    boundsRight,
    boundsBottom,
    unitsPerInch
  };
}

// src/emf-plus-bitmap-decoder.ts
var PIXELFORMAT_24BPP_RGB = 137224;
var PIXELFORMAT_32BPP_RGB = 139273;
var PIXELFORMAT_32BPP_ARGB = 2498570;
var PIXELFORMAT_32BPP_PARGB = 925707;
function decodeEmfPlusBitmapPixels(view, pixelStart, width, height, stride, pixelFormat) {
  const absStride = Math.abs(stride);
  const topDown = stride > 0;
  const rowBytes = width * 4;
  const bmpRowStride = rowBytes + 3 & -4;
  const pixelDataSize = bmpRowStride * height;
  const bmpData = new Uint8Array(pixelDataSize);
  for (let y = 0; y < height; y++) {
    const srcRow = topDown ? y : height - 1 - y;
    const rowOff = pixelStart + srcRow * absStride;
    const dstRow = (height - 1 - y) * bmpRowStride;
    switch (pixelFormat) {
      case PIXELFORMAT_32BPP_ARGB:
      case PIXELFORMAT_32BPP_PARGB: {
        for (let x = 0; x < width; x++) {
          const off = rowOff + x * 4;
          if (off + 3 >= view.byteLength) {
            break;
          }
          let b = view.getUint8(off);
          let g = view.getUint8(off + 1);
          let r = view.getUint8(off + 2);
          const a = view.getUint8(off + 3);
          if (pixelFormat === PIXELFORMAT_32BPP_PARGB && a > 0 && a < 255) {
            r = Math.min(255, Math.round(r * 255 / a));
            g = Math.min(255, Math.round(g * 255 / a));
            b = Math.min(255, Math.round(b * 255 / a));
          }
          const di = dstRow + x * 4;
          bmpData[di] = b;
          bmpData[di + 1] = g;
          bmpData[di + 2] = r;
          bmpData[di + 3] = a;
        }
        break;
      }
      case PIXELFORMAT_32BPP_RGB: {
        for (let x = 0; x < width; x++) {
          const off = rowOff + x * 4;
          if (off + 3 >= view.byteLength) {
            break;
          }
          const di = dstRow + x * 4;
          bmpData[di] = view.getUint8(off);
          bmpData[di + 1] = view.getUint8(off + 1);
          bmpData[di + 2] = view.getUint8(off + 2);
          bmpData[di + 3] = 255;
        }
        break;
      }
      case PIXELFORMAT_24BPP_RGB: {
        for (let x = 0; x < width; x++) {
          const off = rowOff + x * 3;
          if (off + 2 >= view.byteLength) {
            break;
          }
          const di = dstRow + x * 4;
          bmpData[di] = view.getUint8(off);
          bmpData[di + 1] = view.getUint8(off + 1);
          bmpData[di + 2] = view.getUint8(off + 2);
          bmpData[di + 3] = 255;
        }
        break;
      }
      default:
        return null;
    }
  }
  return wrapBmpFile(bmpData, bmpRowStride, width, height, pixelDataSize);
}
function decodeEmfPlusBitmapPixelsToRgba(view, pixelStart, width, height, stride, pixelFormat) {
  const absStride = Math.abs(stride);
  const topDown = stride > 0;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const srcRow = topDown ? y : height - 1 - y;
    const rowOff = pixelStart + srcRow * absStride;
    const dstRow = y * width * 4;
    switch (pixelFormat) {
      case PIXELFORMAT_32BPP_ARGB:
      case PIXELFORMAT_32BPP_PARGB: {
        for (let x = 0; x < width; x++) {
          const off = rowOff + x * 4;
          if (off + 3 >= view.byteLength) {
            break;
          }
          let b = view.getUint8(off);
          let g = view.getUint8(off + 1);
          let r = view.getUint8(off + 2);
          const a = view.getUint8(off + 3);
          if (pixelFormat === PIXELFORMAT_32BPP_PARGB && a > 0 && a < 255) {
            r = Math.min(255, Math.round(r * 255 / a));
            g = Math.min(255, Math.round(g * 255 / a));
            b = Math.min(255, Math.round(b * 255 / a));
          }
          const di = dstRow + x * 4;
          rgba[di] = r;
          rgba[di + 1] = g;
          rgba[di + 2] = b;
          rgba[di + 3] = a;
        }
        break;
      }
      case PIXELFORMAT_32BPP_RGB: {
        for (let x = 0; x < width; x++) {
          const off = rowOff + x * 4;
          if (off + 3 >= view.byteLength) {
            break;
          }
          const di = dstRow + x * 4;
          rgba[di] = view.getUint8(off + 2);
          rgba[di + 1] = view.getUint8(off + 1);
          rgba[di + 2] = view.getUint8(off);
          rgba[di + 3] = 255;
        }
        break;
      }
      case PIXELFORMAT_24BPP_RGB: {
        for (let x = 0; x < width; x++) {
          const off = rowOff + x * 3;
          if (off + 2 >= view.byteLength) {
            break;
          }
          const di = dstRow + x * 4;
          rgba[di] = view.getUint8(off + 2);
          rgba[di + 1] = view.getUint8(off + 1);
          rgba[di + 2] = view.getUint8(off);
          rgba[di + 3] = 255;
        }
        break;
      }
      default:
        return null;
    }
  }
  return rgba;
}
function wrapBmpFile(bmpData, bmpRowStride, width, height, pixelDataSize) {
  const fileHeaderSize = 14;
  const dibHeaderSize = 108;
  const fileSize = fileHeaderSize + dibHeaderSize + pixelDataSize;
  const bmpFile = new ArrayBuffer(fileSize);
  const bmpView = new DataView(bmpFile);
  const bmpBytes = new Uint8Array(bmpFile);
  bmpView.setUint8(0, 66);
  bmpView.setUint8(1, 77);
  bmpView.setUint32(2, fileSize, true);
  bmpView.setUint32(6, 0, true);
  bmpView.setUint32(10, fileHeaderSize + dibHeaderSize, true);
  bmpView.setUint32(14, dibHeaderSize, true);
  bmpView.setInt32(18, width, true);
  bmpView.setInt32(22, height, true);
  bmpView.setUint16(26, 1, true);
  bmpView.setUint16(28, 32, true);
  bmpView.setUint32(30, 3, true);
  bmpView.setUint32(34, pixelDataSize, true);
  bmpView.setInt32(38, 2835, true);
  bmpView.setInt32(42, 2835, true);
  bmpView.setUint32(46, 0, true);
  bmpView.setUint32(50, 0, true);
  bmpView.setUint32(54, 16711680, true);
  bmpView.setUint32(58, 65280, true);
  bmpView.setUint32(62, 255, true);
  bmpView.setUint32(66, 4278190080, true);
  bmpView.setUint32(70, 1934772034, true);
  bmpBytes.set(bmpData, fileHeaderSize + dibHeaderSize);
  return bmpFile;
}

// src/emf-plus-path.ts
function parseEmfPlusPath(data, off, maxLen) {
  if (maxLen < 12) {
    return null;
  }
  data.getUint32(off, true);
  const pointCount = data.getUint32(off + 4, true);
  const pathFlags = data.getUint32(off + 8, true);
  if (pointCount === 0 || pointCount > 1e5) {
    return null;
  }
  const compressed = (pathFlags & 16384) !== 0;
  const pointSize = compressed ? 4 : 8;
  const pointsBytes = pointCount * pointSize;
  const typesBytes = pointCount;
  const neededAfterHeader = pointsBytes + typesBytes;
  if (12 + neededAfterHeader > maxLen) {
    return null;
  }
  const points = [];
  let pOff = off + 12;
  for (let i = 0; i < pointCount; i++) {
    if (compressed) {
      points.push({
        x: data.getInt16(pOff, true),
        y: data.getInt16(pOff + 2, true)
      });
      pOff += 4;
    } else {
      points.push({
        x: data.getFloat32(pOff, true),
        y: data.getFloat32(pOff + 4, true)
      });
      pOff += 8;
    }
  }
  const alignedPOff = pOff + 3 & -4;
  const types = new Uint8Array(data.buffer, data.byteOffset + alignedPOff, pointCount);
  return { kind: "plus-path", points, types: new Uint8Array(types) };
}
function emfPlusPathToClipCmds(path, m) {
  const tx = (x, y) => m[0] * x + m[2] * y + m[4];
  const ty = (x, y) => m[1] * x + m[3] * y + m[5];
  const cmds = [];
  const pts = path.points;
  const types = path.types;
  let i = 0;
  while (i < pts.length) {
    const t = types[i] & 15;
    const close = (types[i] & 128) !== 0;
    if (t === 0) {
      cmds.push({ op: "moveTo", x: tx(pts[i].x, pts[i].y), y: ty(pts[i].x, pts[i].y) });
      i++;
    } else if (t === 3) {
      if (i + 2 < pts.length) {
        cmds.push({
          op: "bezierCurveTo",
          cp1x: tx(pts[i].x, pts[i].y),
          cp1y: ty(pts[i].x, pts[i].y),
          cp2x: tx(pts[i + 1].x, pts[i + 1].y),
          cp2y: ty(pts[i + 1].x, pts[i + 1].y),
          x: tx(pts[i + 2].x, pts[i + 2].y),
          y: ty(pts[i + 2].x, pts[i + 2].y)
        });
        if ((types[i + 2] & 128) !== 0) {
          cmds.push({ op: "closePath" });
        }
        i += 3;
        continue;
      }
      break;
    } else {
      cmds.push({ op: "lineTo", x: tx(pts[i].x, pts[i].y), y: ty(pts[i].x, pts[i].y) });
      i++;
    }
    if (close) {
      cmds.push({ op: "closePath" });
    }
  }
  return cmds;
}
function replayEmfPlusPath(ctx, path) {
  ctx.beginPath();
  const pts = path.points;
  const types = path.types;
  let i = 0;
  while (i < pts.length) {
    const t = types[i] & 15;
    const close = (types[i] & 128) !== 0;
    if (t === 0) {
      ctx.moveTo(pts[i].x, pts[i].y);
      i++;
    } else if (t === 1) {
      ctx.lineTo(pts[i].x, pts[i].y);
      i++;
    } else if (t === 3) {
      if (i + 2 < pts.length) {
        ctx.bezierCurveTo(
          pts[i].x,
          pts[i].y,
          pts[i + 1].x,
          pts[i + 1].y,
          pts[i + 2].x,
          pts[i + 2].y
        );
        if ((types[i + 2] & 128) !== 0) {
          ctx.closePath();
        }
        i += 3;
        continue;
      } else {
        break;
      }
    } else {
      ctx.lineTo(pts[i].x, pts[i].y);
      i++;
    }
    if (close) {
      ctx.closePath();
    }
  }
}

// src/emf-plus-brush-parser.ts
var BRUSH_DATA_PATH = 1;
var BRUSH_DATA_TRANSFORM = 2;
var BRUSH_DATA_PRESET_COLORS = 4;
var BRUSH_DATA_BLEND_FACTORS_H = 8;
var BRUSH_DATA_FOCUS_SCALES = 64;
var MAX_GRADIENT_ELEMENTS = 4096;
function looksLikeGraphicsVersion(v) {
  return v >>> 12 === 900097;
}
function readTransform(view, off) {
  return [
    view.getFloat32(off, true),
    view.getFloat32(off + 4, true),
    view.getFloat32(off + 8, true),
    view.getFloat32(off + 12, true),
    view.getFloat32(off + 16, true),
    view.getFloat32(off + 20, true)
  ];
}
function applyMatrix(m, x, y) {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}
function clamp01(v) {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}
function readWrapMode(raw) {
  switch (raw) {
    case 0:
      return "tile";
    case 1:
      return "tile-flip-x";
    case 2:
      return "tile-flip-y";
    case 3:
      return "tile-flip-xy";
    default:
      return "clamp";
  }
}
function normaliseStops(stops) {
  return stops.map((s) => ({ ...s, offset: clamp01(s.offset) })).sort((a, b) => a.offset - b.offset);
}
function readPresetColors(view, off, end) {
  if (off + 4 > end) {
    return null;
  }
  const count = view.getUint32(off, true);
  if (count === 0 || count > MAX_GRADIENT_ELEMENTS) {
    return null;
  }
  const posOff = off + 4;
  const colOff = posOff + count * 4;
  const next = colOff + count * 4;
  if (next > end) {
    return null;
  }
  const stops = [];
  for (let i = 0; i < count; i++) {
    const argb = view.getUint32(colOff + i * 4, true);
    stops.push({
      offset: view.getFloat32(posOff + i * 4, true),
      color: argbToRgba(argb),
      argb
    });
  }
  return { stops, next };
}
function readBlendFactors(view, off, end) {
  if (off + 4 > end) {
    return null;
  }
  const count = view.getUint32(off, true);
  if (count === 0 || count > MAX_GRADIENT_ELEMENTS) {
    return null;
  }
  const posOff = off + 4;
  const facOff = posOff + count * 4;
  const next = facOff + count * 4;
  if (next > end) {
    return null;
  }
  const entries = [];
  for (let i = 0; i < count; i++) {
    entries.push({
      pos: view.getFloat32(posOff + i * 4, true),
      factor: view.getFloat32(facOff + i * 4, true)
    });
  }
  return { entries, next };
}
function parseLinearGradient(view, b, end) {
  if (b + 40 > end) {
    return null;
  }
  const flags = view.getUint32(b, true);
  const wrapMode = readWrapMode(view.getUint32(b + 4, true));
  const rx = view.getFloat32(b + 8, true);
  const ry = view.getFloat32(b + 12, true);
  const rw = view.getFloat32(b + 16, true);
  const rh = view.getFloat32(b + 20, true);
  const startArgb = view.getUint32(b + 24, true);
  const endArgb = view.getUint32(b + 28, true);
  let o = b + 40;
  let transform = null;
  if (flags & BRUSH_DATA_TRANSFORM && o + 24 <= end) {
    transform = readTransform(view, o);
    o += 24;
  }
  let stops = [
    { offset: 0, color: argbToRgba(startArgb), argb: startArgb },
    { offset: 1, color: argbToRgba(endArgb), argb: endArgb }
  ];
  if (flags & BRUSH_DATA_PRESET_COLORS) {
    const preset = readPresetColors(view, o, end);
    if (preset) {
      stops = preset.stops;
    }
  } else if (flags & BRUSH_DATA_BLEND_FACTORS_H) {
    const blend = readBlendFactors(view, o, end);
    if (blend) {
      stops = blend.entries.map((e) => ({
        offset: e.pos,
        color: lerpArgbToRgba(startArgb, endArgb, e.factor),
        argb: lerpArgb(startArgb, endArgb, e.factor)
      }));
    }
  }
  let p1 = { x: rx, y: ry + rh / 2 };
  let p2 = { x: rx + rw, y: ry + rh / 2 };
  if (transform) {
    p1 = applyMatrix(transform, p1.x, p1.y);
    p2 = applyMatrix(transform, p2.x, p2.y);
  }
  emfLog(
    `parseEmfPlusBrushObject: linear gradient (${p1.x.toFixed(1)},${p1.y.toFixed(1)})\u2192(${p2.x.toFixed(1)},${p2.y.toFixed(1)}), ${stops.length} stop(s)`
  );
  return {
    kind: "plus-brush",
    color: argbToRgba(startArgb),
    gradient: {
      type: "linear",
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
      stops: normaliseStops(stops),
      wrapMode,
      rect: { x: rx, y: ry, w: rw, h: rh },
      transform
    }
  };
}
function decodeTextureImage(view, off, end) {
  if (off + 28 > end) {
    return null;
  }
  const imageDataType = view.getUint32(off + 4, true);
  if (imageDataType !== 1) {
    return null;
  }
  const width = view.getInt32(off + 8, true);
  const height = view.getInt32(off + 12, true);
  const stride = view.getInt32(off + 16, true);
  const pixelFormat = view.getUint32(off + 20, true);
  const pixelStart = off + 28;
  const absStride = Math.abs(stride);
  if (width <= 0 || height <= 0 || width > 8192 || height > 8192 || pixelStart + absStride * height > end) {
    return null;
  }
  const rgba = decodeEmfPlusBitmapPixelsToRgba(view, pixelStart, width, height, stride, pixelFormat);
  return rgba ? { width, height, rgba } : null;
}
function findCompressedTextureImageBytes(view, off, end) {
  if (off + 28 > end) {
    return null;
  }
  if (view.getUint32(off + 4, true) !== 1) {
    return null;
  }
  if (decodeTextureImage(view, off, end)) {
    return null;
  }
  const start = off + 28;
  return start < end ? { start, end } : null;
}
function textureBrushImageOffset(view, b, end) {
  if (b + 8 > end) {
    return null;
  }
  const flags = view.getUint32(b, true);
  let o = b + 8;
  if (flags & BRUSH_DATA_TRANSFORM && o + 24 <= end) {
    o += 24;
  }
  return o;
}
function parseTextureBrush(view, b, end, predecoded) {
  if (b + 8 > end) {
    return null;
  }
  const flags = view.getUint32(b, true);
  const wrapMode = readWrapMode(view.getUint32(b + 4, true));
  let o = b + 8;
  let transform = null;
  if (flags & BRUSH_DATA_TRANSFORM && o + 24 <= end) {
    transform = readTransform(view, o);
    o += 24;
  }
  const image = decodeTextureImage(view, o, end) ?? predecoded ?? null;
  if (!image) {
    return null;
  }
  const texture = {
    width: image.width,
    height: image.height,
    rgba: image.rgba,
    wrapMode,
    transform
  };
  let r = 0;
  let g = 0;
  let bl = 0;
  const n = image.width * image.height;
  for (let i = 0; i < n; i++) {
    r += image.rgba[i * 4];
    g += image.rgba[i * 4 + 1];
    bl += image.rgba[i * 4 + 2];
  }
  const avg = n > 0 ? `rgba(${Math.round(r / n)},${Math.round(g / n)},${Math.round(bl / n)},1)` : "rgba(128,128,128,1)";
  emfLog(`parseEmfPlusBrushObject: texture fill ${image.width}x${image.height}, wrapMode=${wrapMode}`);
  return { kind: "plus-brush", color: avg, texture };
}
function parsePathGradient(view, b, end) {
  if (b + 24 > end) {
    return null;
  }
  const flags = view.getUint32(b, true);
  const wrapMode = readWrapMode(view.getUint32(b + 4, true));
  const centerArgb = view.getUint32(b + 8, true);
  let cx = view.getFloat32(b + 12, true);
  let cy = view.getFloat32(b + 16, true);
  const surroundCount = view.getUint32(b + 20, true);
  if (surroundCount > MAX_GRADIENT_ELEMENTS) {
    return { kind: "plus-brush", color: argbToRgba(centerArgb) };
  }
  const surround = [];
  let o = b + 24;
  for (let i = 0; i < surroundCount && o + 4 <= end; i++) {
    surround.push(view.getUint32(o, true));
    o += 4;
  }
  let boundaryPts = [];
  let boundaryArgb = [];
  const surroundAt = (k) => surround.length > 0 ? surround[Math.min(k, surround.length - 1)] : centerArgb;
  if (flags & BRUSH_DATA_PATH) {
    if (o + 4 <= end) {
      const pathSize = view.getInt32(o, true);
      o += 4;
      if (pathSize > 0 && o + pathSize <= end) {
        const path = parseEmfPlusPath(view, o, pathSize);
        if (path) {
          const flat = flattenFirstFigure(path.points, path.types, surroundAt);
          boundaryPts = flat.points;
          boundaryArgb = flat.argb;
        }
        o += pathSize;
      }
    }
  } else if (o + 4 <= end) {
    const ptCount = view.getUint32(o, true);
    o += 4;
    if (ptCount > 0 && ptCount <= MAX_GRADIENT_ELEMENTS && o + ptCount * 8 <= end) {
      for (let i = 0; i < ptCount; i++) {
        boundaryPts.push({
          x: view.getFloat32(o + i * 8, true),
          y: view.getFloat32(o + i * 8 + 4, true)
        });
        boundaryArgb.push(surroundAt(i));
      }
      o += ptCount * 8;
    }
  }
  let transform = null;
  if (flags & BRUSH_DATA_TRANSFORM && o + 24 <= end) {
    transform = readTransform(view, o);
    o += 24;
  }
  const center = { x: cx, y: cy };
  const m = transform;
  const worldBoundary = m ? boundaryPts.map((p) => applyMatrix(m, p.x, p.y)) : boundaryPts;
  if (m) {
    ({ x: cx, y: cy } = applyMatrix(m, cx, cy));
  }
  const surroundArgb = surround.length > 0 ? surround[0] : centerArgb;
  let stops = [
    { offset: 0, color: argbToRgba(centerArgb), argb: centerArgb },
    { offset: 1, color: argbToRgba(surroundArgb), argb: surroundArgb }
  ];
  let blend = null;
  let preset = null;
  if (flags & BRUSH_DATA_PRESET_COLORS) {
    const presetData = readPresetColors(view, o, end);
    if (presetData) {
      stops = presetData.stops.map((s) => ({ ...s, offset: 1 - s.offset }));
      preset = {
        positions: presetData.stops.map((s) => s.offset),
        argb: presetData.stops.map((s) => s.argb ?? 0)
      };
      o = presetData.next;
    }
  } else if (flags & BRUSH_DATA_BLEND_FACTORS_H) {
    const blendData = readBlendFactors(view, o, end);
    if (blendData) {
      stops = blendData.entries.map((e) => ({
        offset: 1 - e.pos,
        color: lerpArgbToRgba(surroundArgb, centerArgb, e.factor),
        argb: lerpArgb(surroundArgb, centerArgb, e.factor)
      }));
      blend = {
        positions: blendData.entries.map((e) => e.pos),
        factors: blendData.entries.map((e) => e.factor)
      };
      o = blendData.next;
    }
  }
  let focus = null;
  if (flags & BRUSH_DATA_FOCUS_SCALES && o + 12 <= end && view.getUint32(o, true) === 2) {
    focus = { x: view.getFloat32(o + 4, true), y: view.getFloat32(o + 8, true) };
  }
  let r = 0;
  for (const p of worldBoundary) {
    const d = Math.hypot(p.x - cx, p.y - cy);
    if (d > r) {
      r = d;
    }
  }
  if (!(r > 0)) {
    return { kind: "plus-brush", color: argbToRgba(centerArgb) };
  }
  emfLog(
    `parseEmfPlusBrushObject: path gradient centre=(${cx.toFixed(1)},${cy.toFixed(1)}), ${boundaryPts.length} boundary point(s)`
  );
  return {
    kind: "plus-brush",
    color: argbToRgba(centerArgb),
    gradient: {
      type: "radial",
      cx,
      cy,
      r,
      stops: normaliseStops(stops),
      wrapMode,
      shape: {
        center,
        centerArgb,
        boundary: boundaryPts,
        boundaryArgb,
        blend,
        preset,
        focus,
        transform
      }
    }
  };
}
function lerpArgb(a, b, t) {
  const tc = Math.min(1, Math.max(0, t));
  let out = 0;
  for (let shift = 24; shift >= 0; shift -= 8) {
    const ca = a >>> shift & 255;
    const cb = b >>> shift & 255;
    out = out * 256 + Math.round(ca + (cb - ca) * tc);
  }
  return out >>> 0;
}
var BEZIER_STEPS = 24;
function flattenFirstFigure(points, types, colorAt) {
  const outPts = [];
  const outArgb = [];
  for (let k = 0; k < points.length; k++) {
    const kind = types[k] & 7;
    if (k > 0 && kind === 0) {
      break;
    }
    if (kind === 3 && k > 0 && k + 2 < points.length) {
      const p0 = points[k - 1];
      const p1 = points[k];
      const p2 = points[k + 1];
      const p3 = points[k + 2];
      const c0 = colorAt(k - 1);
      const c3 = colorAt(k + 2);
      for (let i = 1; i <= BEZIER_STEPS; i++) {
        const t = i / BEZIER_STEPS;
        const u = 1 - t;
        outPts.push({
          x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
          y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y
        });
        outArgb.push(lerpArgb(c0, c3, t));
      }
      k += 2;
      if (types[k] & 128) {
        break;
      }
      continue;
    }
    outPts.push(points[k]);
    outArgb.push(colorAt(k));
    if (types[k] & 128) {
      break;
    }
  }
  const n = outPts.length;
  if (n > 1 && outPts[0].x === outPts[n - 1].x && outPts[0].y === outPts[n - 1].y) {
    outPts.pop();
    outArgb.pop();
  }
  return { points: outPts, argb: outArgb };
}
function parseEmfPlusBrushObject(view, dataOff, recDataSize, textureCache) {
  if (recDataSize < 8) {
    return null;
  }
  const end = dataOff + recDataSize;
  const hasVersion = looksLikeGraphicsVersion(view.getUint32(dataOff, true));
  const typeOff = dataOff + (hasVersion ? 4 : 0);
  if (typeOff + 8 > end) {
    return null;
  }
  const brushType = view.getUint32(typeOff, true);
  const b = typeOff + 4;
  switch (brushType) {
    case EMFPLUS_BRUSHTYPE_SOLID:
      return { kind: "plus-brush", color: argbToRgba(view.getUint32(b, true)) };
    case EMFPLUS_BRUSHTYPE_HATCHFILL:
      if (b + 8 <= end) {
        return { kind: "plus-brush", color: argbToRgba(view.getUint32(b + 4, true)) };
      }
      return { kind: "plus-brush", color: "rgba(0,0,0,1)" };
    case EMFPLUS_BRUSHTYPE_TEXTUREFILL: {
      const predecoded = textureCache?.get(dataOff);
      const brush = parseTextureBrush(view, b, end, predecoded);
      return brush ?? { kind: "plus-brush", color: "rgba(0,0,0,1)" };
    }
    case EMFPLUS_BRUSHTYPE_LINEARGRADIENT: {
      const brush = parseLinearGradient(view, b, end);
      return brush ?? { kind: "plus-brush", color: "rgba(0,0,0,1)" };
    }
    case EMFPLUS_BRUSHTYPE_PATHGRADIENT: {
      const brush = parsePathGradient(view, b, end);
      return brush ?? { kind: "plus-brush", color: "rgba(0,0,0,1)" };
    }
    default:
      return { kind: "plus-brush", color: "rgba(0,0,0,1)" };
  }
}

// src/emf-plus-texture-predecode.ts
function scanEmfPlusStream(view, offset, length, out) {
  const end = offset + length;
  let off = offset;
  let recordCount = 0;
  const MAX_RECORDS = 5e5;
  while (off + 12 <= end && recordCount < MAX_RECORDS) {
    const recType = view.getUint16(off, true);
    const recFlags = view.getUint16(off + 2, true);
    const recSize = view.getUint32(off + 4, true);
    const recDataSize = view.getUint32(off + 8, true);
    if (recSize < 12 || off + recSize > end) {
      break;
    }
    recordCount++;
    const dataOff = off + 12;
    const isContinuation = (recFlags & 32768) !== 0;
    if (recType === EMFPLUS_OBJECT && !isContinuation) {
      const objectType = recFlags >> 8 & 127;
      if (objectType === EMFPLUS_OBJECTTYPE_BRUSH && recDataSize >= 8) {
        const recEnd = dataOff + recDataSize;
        const hasVersion = looksLikeGraphicsVersion(view.getUint32(dataOff, true));
        const typeOff = dataOff + (hasVersion ? 4 : 0);
        if (typeOff + 8 <= recEnd) {
          const brushType = view.getUint32(typeOff, true);
          if (brushType === EMFPLUS_BRUSHTYPE_TEXTUREFILL) {
            const b = typeOff + 4;
            const imgOff = textureBrushImageOffset(view, b, recEnd);
            if (imgOff !== null) {
              const bytes = findCompressedTextureImageBytes(view, imgOff, recEnd);
              if (bytes) {
                out.push({ dataOff, byteStart: bytes.start, byteEnd: bytes.end });
              }
            }
          }
        }
      }
    }
    off += recSize;
  }
}
function scanEmfForTextureCandidates(view) {
  const candidates = [];
  let offset = 0;
  const maxOffset = view.byteLength;
  let recordCount = 0;
  const MAX_RECORDS = 5e5;
  while (offset + 8 <= maxOffset && recordCount < MAX_RECORDS) {
    const recType = view.getUint32(offset, true);
    const recSize = view.getUint32(offset + 4, true);
    if (recSize < 8 || offset + recSize > maxOffset) {
      break;
    }
    recordCount++;
    if (recType === EMR_COMMENT && recSize >= 16) {
      const dataOff = offset + 8;
      const commentDataSize = view.getUint32(dataOff, true);
      const sig = view.getUint32(dataOff + 4, true);
      if (sig === EMFPLUS_SIGNATURE && commentDataSize > 4) {
        scanEmfPlusStream(view, dataOff + 8, commentDataSize - 4, candidates);
      }
    } else if (recType === EMR_EOF) {
      break;
    }
    offset += recSize;
  }
  return candidates;
}
async function decodeCompressedBytesToRgba(view, start, end) {
  const byteLength = end - start;
  if (byteLength <= 0) {
    return null;
  }
  const src = new Uint8Array(view.buffer, view.byteOffset + start, byteLength);
  const bytes = new ArrayBuffer(byteLength);
  new Uint8Array(bytes).set(src);
  try {
    const decoded = await decodeDeferredImageBytes(bytes);
    if (!decoded) {
      return null;
    }
    const { width, height } = decoded;
    if (width <= 0 || height <= 0 || width > 8192 || height > 8192) {
      decoded.close();
      return null;
    }
    const temp = createTempCanvas(width, height);
    if (!temp) {
      decoded.close();
      return null;
    }
    canvasDrawImage(temp.ctx, decoded.drawable, 0, 0, width, height);
    decoded.close();
    const pixels = canvasGetImageData(temp.ctx, 0, 0, width, height);
    return { width, height, rgba: new Uint8ClampedArray(pixels.data.buffer.slice(0)) };
  } catch (err) {
    emfWarn(
      "preDecodeEmfPlusTextures: failed to decode a compressed texture image:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}
async function preDecodeEmfPlusTextures(view) {
  const cache = /* @__PURE__ */ new Map();
  let candidates;
  try {
    candidates = scanEmfForTextureCandidates(view);
  } catch (err) {
    emfWarn("preDecodeEmfPlusTextures: scan failed:", err instanceof Error ? err.message : err);
    return cache;
  }
  if (candidates.length === 0) {
    return cache;
  }
  emfLog(`preDecodeEmfPlusTextures: found ${candidates.length} compressed-texture candidate(s)`);
  for (const c of candidates) {
    const decoded = await decodeCompressedBytesToRgba(view, c.byteStart, c.byteEnd);
    if (decoded) {
      cache.set(c.dataOff, decoded);
      emfLog(`preDecodeEmfPlusTextures: decoded texture at dataOff=0x${c.dataOff.toString(16)}: ${decoded.width}x${decoded.height}`);
    }
  }
  return cache;
}

// src/emf-gdi-coord.ts
function gmx(r, x) {
  const wt = r.state.worldTransform;
  const px = wt[0] * x + wt[4];
  if (r.useMappingMode) {
    return (px - r.windowOrg.x) / (r.windowExt.cx || 1) * (r.viewportExt.cx || 1) + r.viewportOrg.x;
  }
  return (px - r.bounds.left) * r.sx;
}
function gmy(r, y) {
  const wt = r.state.worldTransform;
  const py = wt[3] * y + wt[5];
  if (r.useMappingMode) {
    return (py - r.windowOrg.y) / (r.windowExt.cy || 1) * (r.viewportExt.cy || 1) + r.viewportOrg.y;
  }
  return (py - r.bounds.top) * r.sy;
}
function gmw(r, w) {
  const pw = r.state.worldTransform[0] * w;
  if (r.useMappingMode) {
    return pw / (r.windowExt.cx || 1) * (r.viewportExt.cx || 1);
  }
  return pw * r.sx;
}
function gmh(r, h) {
  const ph = r.state.worldTransform[3] * h;
  if (r.useMappingMode) {
    return ph / (r.windowExt.cy || 1) * (r.viewportExt.cy || 1);
  }
  return ph * r.sy;
}
function activateGdiMappingMode(r) {
  r.useMappingMode = true;
}
function hasWorldRotation(r) {
  const wt = r.state.worldTransform;
  return wt[1] !== 0 || wt[2] !== 0;
}
function gdiDeviceMatrix(r) {
  const wt = r.state.worldTransform;
  if (r.useMappingMode) {
    const kx = (r.viewportExt.cx || 1) / (r.windowExt.cx || 1);
    const ky = (r.viewportExt.cy || 1) / (r.windowExt.cy || 1);
    return [
      wt[0] * kx,
      wt[1] * ky,
      wt[2] * kx,
      wt[3] * ky,
      (wt[4] - r.windowOrg.x) * kx + r.viewportOrg.x,
      (wt[5] - r.windowOrg.y) * ky + r.viewportOrg.y
    ];
  }
  const sx = r.sx || 1;
  const sy = r.sy || 1;
  return [wt[0] * sx, wt[1] * sy, wt[2] * sx, wt[3] * sy, (wt[4] - r.bounds.left) * sx, (wt[5] - r.bounds.top) * sy];
}
function gmapPoint(r, x, y) {
  const m = gdiDeviceMatrix(r);
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}
function gdiEllipseParams(r, cx0, cy0, rx0, ry0) {
  const m = gdiDeviceMatrix(r);
  const center = gmapPoint(r, cx0, cy0);
  const a11 = m[0] * rx0;
  const a12 = m[2] * ry0;
  const a21 = m[1] * rx0;
  const a22 = m[3] * ry0;
  const p = a11 * a11 + a12 * a12;
  const q = a11 * a21 + a12 * a22;
  const s = a21 * a21 + a22 * a22;
  const mid = (p + s) / 2;
  const spread = Math.sqrt(Math.max(0, ((p - s) / 2) ** 2 + q * q));
  const lambda1 = Math.max(0, mid + spread);
  const lambda2 = Math.max(0, mid - spread);
  const rotation = 0.5 * Math.atan2(2 * q, p - s);
  return {
    cx: center.x,
    cy: center.y,
    rx: Math.sqrt(lambda1),
    ry: Math.sqrt(lambda2),
    rotation
  };
}

// src/emf-gdi-path-record.ts
function replayGdiPathCmds(target, cmds) {
  for (const c of cmds) {
    switch (c.op) {
      case "moveTo":
        target.moveTo(c.x, c.y);
        break;
      case "lineTo":
        target.lineTo(c.x, c.y);
        break;
      case "rect":
        target.rect(c.x, c.y, c.w, c.h);
        break;
      case "bezierCurveTo":
        target.bezierCurveTo(c.cp1x, c.cp1y, c.cp2x, c.cp2y, c.x, c.y);
        break;
      case "arcTo":
        target.arcTo(c.x1, c.y1, c.x2, c.y2, c.radius);
        break;
      case "ellipse":
        target.ellipse(c.cx, c.cy, c.rx, c.ry, c.rotation, c.startAngle, c.endAngle, c.ccw);
        break;
      case "closePath":
        target.closePath();
        break;
    }
  }
}
function gdiPathRecorder(rCtx) {
  const { ctx, pathCmds } = rCtx;
  return new Proxy(ctx, {
    get(target, prop, receiver) {
      switch (prop) {
        case "moveTo":
          return (x, y) => {
            pathCmds.push({ op: "moveTo", x, y });
            return target.moveTo(x, y);
          };
        case "lineTo":
          return (x, y) => {
            pathCmds.push({ op: "lineTo", x, y });
            return target.lineTo(x, y);
          };
        case "rect":
          return (x, y, w, h) => {
            pathCmds.push({ op: "rect", x, y, w, h });
            return target.rect(x, y, w, h);
          };
        case "bezierCurveTo":
          return (cp1x, cp1y, cp2x, cp2y, x, y) => {
            pathCmds.push({ op: "bezierCurveTo", cp1x, cp1y, cp2x, cp2y, x, y });
            return target.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
          };
        case "arcTo":
          return (x1, y1, x2, y2, radius) => {
            pathCmds.push({ op: "arcTo", x1, y1, x2, y2, radius });
            return target.arcTo(x1, y1, x2, y2, radius);
          };
        case "ellipse":
          return (cx, cy, rx, ry, rotation, startAngle, endAngle, ccw) => {
            pathCmds.push({ op: "ellipse", cx, cy, rx, ry, rotation, startAngle, endAngle, ccw: !!ccw });
            return target.ellipse(cx, cy, rx, ry, rotation, startAngle, endAngle, ccw);
          };
        case "closePath":
          return () => {
            pathCmds.push({ op: "closePath" });
            return target.closePath();
          };
        default: {
          const value = Reflect.get(target, prop, receiver);
          return typeof value === "function" ? value.bind(target) : value;
        }
      }
    }
  });
}

// src/emf-rop3.ts
function rop3Index(rop) {
  return rop >>> 16 & 255;
}
function rop3Operands(index) {
  const t = index & 255;
  return {
    usesP: (t >> 4 & 15) !== (t & 15),
    usesS: (t >> 2 & 51) !== (t & 51),
    usesD: (t >> 1 & 85) !== (t & 85)
  };
}
function evalRop3(index, p, s, d, mask = 16777215) {
  let out = 0;
  const np = ~p;
  const ns = ~s;
  const nd = ~d;
  for (let i = 0; i < 8; i++) {
    if (index & 1 << i) {
      out |= (i & 4 ? p : np) & (i & 2 ? s : ns) & (i & 1 ? d : nd);
    }
  }
  return out & mask;
}
function classifyRop3(rop) {
  const index = rop3Index(rop);
  switch (index) {
    case 204:
      return { kind: "copy" };
    case 0:
      return { kind: "solid", color: "black" };
    case 255:
      return { kind: "solid", color: "white" };
    case 170:
      return { kind: "noop" };
    case 85:
      return { kind: "invert-dest" };
    default:
      return { kind: "ternary", index, operands: rop3Operands(index) };
  }
}
function applyRop3(dst, src, pattern, index, originX, originY) {
  const d = dst.data;
  const s = src ? src.data : null;
  const w = dst.width;
  const h = dst.height;
  const solidP = typeof pattern === "number" ? pattern : 0;
  const sampleP = typeof pattern === "function" ? pattern : null;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const dv = d[i] << 16 | d[i + 1] << 8 | d[i + 2];
      const sv = s ? s[i] << 16 | s[i + 1] << 8 | s[i + 2] : 0;
      const pv = sampleP ? sampleP(originX + x, originY + y) : solidP;
      const r = evalRop3(index, pv, sv, dv);
      d[i] = r >> 16 & 255;
      d[i + 1] = r >> 8 & 255;
      d[i + 2] = r & 255;
      d[i + 3] = 255;
    }
  }
}
function clampPositiveRect(x, y, w, h, canvasW, canvasH) {
  let left = w < 0 ? x + w : x;
  let top = h < 0 ? y + h : y;
  let width = Math.abs(w);
  let height = Math.abs(h);
  left = Math.round(left);
  top = Math.round(top);
  width = Math.round(width);
  height = Math.round(height);
  const right = Math.min(left + width, Math.round(canvasW));
  const bottom = Math.min(top + height, Math.round(canvasH));
  left = Math.max(left, 0);
  top = Math.max(top, 0);
  width = right - left;
  height = bottom - top;
  if (width <= 0 || height <= 0) {
    return null;
  }
  return { x: left, y: top, w: width, h: height };
}

// src/emf-rop2-exact.ts
var ROP2_EXACT_INDEX = {
  [R2_MASKPEN]: 160,
  // P & D
  [R2_MERGEPEN]: 250,
  // P | D
  [R2_XORPEN]: 90,
  // P ^ D
  [R2_NOTXORPEN]: 165,
  // ~(P ^ D)
  [R2_MASKPENNOT]: 80,
  // P & ~D
  [R2_MERGEPENNOT]: 245,
  // P | ~D
  [R2_MASKNOTPEN]: 10,
  // ~P & D
  [R2_MERGENOTPEN]: 175,
  // ~P | D
  [R2_NOTMASKPEN]: 95,
  // ~(P & D)
  [R2_NOTMERGEPEN]: 5
  // ~(P | D)
};
function isExactRop2Bitwise(rop2) {
  return rop2 in ROP2_EXACT_INDEX;
}
function packRgb(r, g, b) {
  return r << 16 | g << 8 | b;
}
function surfaceSize(ctx) {
  const canvas = ctx.canvas;
  const w = canvas?.width;
  const h = canvas?.height;
  return typeof w === "number" && typeof h === "number" && w > 0 && h > 0 ? { w, h } : null;
}
function paintWithExactRop2(ctx, rop2, color, draw) {
  const index = ROP2_EXACT_INDEX[rop2];
  if (index === void 0) {
    return false;
  }
  const size = surfaceSize(ctx);
  if (!size) {
    return false;
  }
  try {
    const temp = createTempCanvas(size.w, size.h);
    if (!temp) {
      return false;
    }
    temp.ctx.fillStyle = color;
    temp.ctx.strokeStyle = color;
    draw(temp.ctx);
    const paint = canvasGetImageData(temp.ctx, 0, 0, size.w, size.h);
    const dest = canvasGetImageData(ctx, 0, 0, size.w, size.h);
    const pd = paint.data;
    const dd = dest.data;
    for (let i = 0; i < dd.length; i += 4) {
      const coverage = pd[i + 3] / 255;
      if (coverage <= 0) {
        continue;
      }
      const p = packRgb(pd[i], pd[i + 1], pd[i + 2]);
      const d = packRgb(dd[i], dd[i + 1], dd[i + 2]);
      const combined = evalRop3(index, p, d, d);
      const cr = combined >> 16 & 255;
      const cg = combined >> 8 & 255;
      const cb = combined & 255;
      dd[i] = Math.round(dd[i] + (cr - dd[i]) * coverage);
      dd[i + 1] = Math.round(dd[i + 1] + (cg - dd[i + 1]) * coverage);
      dd[i + 2] = Math.round(dd[i + 2] + (cb - dd[i + 2]) * coverage);
      dd[i + 3] = 255;
    }
    canvasPutImageData(ctx, dest, 0, 0);
    return true;
  } catch {
    return false;
  }
}

// src/emf-gdi-shape-paint.ts
function surfaceSize2(ctx) {
  const canvas = ctx.canvas;
  const w = canvas?.width;
  const h = canvas?.height;
  return typeof w === "number" && typeof h === "number" && w > 0 && h > 0 ? { w, h } : null;
}
function fillCurrentPathWithGdiPattern(rCtx, fillRule) {
  const { ctx, bounds, state } = rCtx;
  const realized = realizeBrush(state);
  if (realized.kind !== "tile") {
    return false;
  }
  const size = surfaceSize2(ctx);
  if (!size || typeof ctx.isPointInPath !== "function") {
    return false;
  }
  const sx = rCtx.sx || 1;
  const sy = rCtx.sy || 1;
  try {
    const img = canvasGetImageData(ctx, 0, 0, size.w, size.h);
    const d = img.data;
    for (let y = 0; y < size.h; y++) {
      for (let x = 0; x < size.w; x++) {
        if (!ctx.isPointInPath(x + 0.5, y + 0.5, fillRule)) {
          continue;
        }
        const lx = Math.floor(bounds.left + (x + 0.5) / sx);
        const ly = Math.floor(bounds.top + (y + 0.5) / sy);
        const c = sampleTile(realized, lx, ly, state.brushOrgX, state.brushOrgY);
        const o = (y * size.w + x) * 4;
        d[o] = c >>> 16 & 255;
        d[o + 1] = c >>> 8 & 255;
        d[o + 2] = c & 255;
        d[o + 3] = 255;
      }
    }
    canvasPutImageData(ctx, img, 0, 0);
    return true;
  } catch {
    return false;
  }
}
function fillShapeExactOrFast(rCtx, buildPath, fillRule = "nonzero") {
  const { ctx, state } = rCtx;
  if (state.brushStyle === 1) {
    return;
  }
  if (realizeBrush(state).kind === "tile") {
    if (fillCurrentPathWithGdiPattern(rCtx, fillRule)) {
      return;
    }
  } else {
    const paint = rop2Paint(state.rop2);
    if (!paint.exact && isExactRop2Bitwise(state.rop2)) {
      const handled = paintWithExactRop2(ctx, state.rop2, state.brushColor, (scratch) => {
        buildPath(scratch);
        scratch.fill(fillRule);
      });
      if (handled) {
        return;
      }
    }
  }
  applyBrush(ctx, state);
  ctx.fill(fillRule);
}
function applyPenGeometry(ctx, state) {
  ctx.lineWidth = Math.max(state.penWidth, 1);
  switch (state.penStyle) {
    case 1:
      ctx.setLineDash([8, 4]);
      break;
    case 2:
      ctx.setLineDash([2, 2]);
      break;
    case 3:
      ctx.setLineDash([8, 4, 2, 4]);
      break;
    case 4:
      ctx.setLineDash([8, 4, 2, 4, 2, 4]);
      break;
    default:
      ctx.setLineDash([]);
      break;
  }
}
function strokeShapeExactOrFast(rCtx, buildPath) {
  const { ctx, state } = rCtx;
  const paint = rop2Paint(state.rop2);
  if (!paint.exact && isExactRop2Bitwise(state.rop2) && state.penStyle !== 5) {
    const handled = paintWithExactRop2(ctx, state.rop2, state.penColor, (scratch) => {
      applyPenGeometry(scratch, state);
      buildPath(scratch);
      scratch.stroke();
    });
    if (handled) {
      return;
    }
  }
  applyPen(ctx, state);
  ctx.stroke();
}

// src/emf-gdi-draw-shapes.ts
function needsPathBasedRectangle(rCtx) {
  const paint = rop2Paint(rCtx.state.rop2);
  const ropExact = !paint.exact && isExactRop2Bitwise(rCtx.state.rop2);
  return ropExact || realizeBrush(rCtx.state).kind === "tile";
}
function handleSetPixelV(rCtx, dataOff, recSize) {
  const { ctx, view } = rCtx;
  if (recSize >= 20) {
    const x = view.getInt32(dataOff, true);
    const y = view.getInt32(dataOff + 4, true);
    const color = readColorRef(view, dataOff + 8);
    const p = hasWorldRotation(rCtx) ? gmapPoint(rCtx, x, y) : { x: gmx(rCtx, x), y: gmy(rCtx, y) };
    ctx.fillStyle = color;
    ctx.fillRect(p.x, p.y, 1, 1);
  }
  return true;
}
function handleMoveToEx(rCtx, dataOff, recSize) {
  const { view, state, inPath } = rCtx;
  if (recSize >= 16) {
    state.curX = view.getInt32(dataOff, true);
    state.curY = view.getInt32(dataOff + 4, true);
    if (inPath) {
      const p = hasWorldRotation(rCtx) ? gmapPoint(rCtx, state.curX, state.curY) : { x: gmx(rCtx, state.curX), y: gmy(rCtx, state.curY) };
      gdiPathRecorder(rCtx).moveTo(p.x, p.y);
    }
  }
  return true;
}
function handleLineTo(rCtx, dataOff, recSize) {
  const { ctx, view, state, inPath } = rCtx;
  if (recSize >= 16) {
    const lx = view.getInt32(dataOff, true);
    const ly = view.getInt32(dataOff + 4, true);
    const rotated = hasWorldRotation(rCtx);
    const to = rotated ? gmapPoint(rCtx, lx, ly) : { x: gmx(rCtx, lx), y: gmy(rCtx, ly) };
    if (inPath) {
      gdiPathRecorder(rCtx).lineTo(to.x, to.y);
    } else {
      const from = rotated ? gmapPoint(rCtx, state.curX, state.curY) : { x: gmx(rCtx, state.curX), y: gmy(rCtx, state.curY) };
      const build = (c) => {
        c.beginPath();
        c.moveTo(from.x, from.y);
        c.lineTo(to.x, to.y);
      };
      build(ctx);
      strokeShapeExactOrFast(rCtx, build);
    }
    state.curX = lx;
    state.curY = ly;
  }
  return true;
}
function handleRectangle(rCtx, dataOff, recSize) {
  const { ctx, view, state, inPath } = rCtx;
  if (recSize >= 24) {
    const l = view.getInt32(dataOff, true);
    const t = view.getInt32(dataOff + 4, true);
    const r = view.getInt32(dataOff + 8, true);
    const b = view.getInt32(dataOff + 12, true);
    const rotated = hasWorldRotation(rCtx);
    if (rotated) {
      const p1 = gmapPoint(rCtx, l, t);
      const p2 = gmapPoint(rCtx, r, t);
      const p3 = gmapPoint(rCtx, r, b);
      const p4 = gmapPoint(rCtx, l, b);
      const appendRect = (c) => {
        c.moveTo(p1.x, p1.y);
        c.lineTo(p2.x, p2.y);
        c.lineTo(p3.x, p3.y);
        c.lineTo(p4.x, p4.y);
        c.closePath();
      };
      if (inPath) {
        appendRect(gdiPathRecorder(rCtx));
      } else {
        const build = (c) => {
          c.beginPath();
          appendRect(c);
        };
        build(ctx);
        fillShapeExactOrFast(rCtx, build);
        strokeShapeExactOrFast(rCtx, build);
      }
      return true;
    }
    if (inPath) {
      gdiPathRecorder(rCtx).rect(gmx(rCtx, l), gmy(rCtx, t), gmw(rCtx, r - l), gmh(rCtx, b - t));
    } else {
      const x = gmx(rCtx, l);
      const y = gmy(rCtx, t);
      const w = gmw(rCtx, r - l);
      const h = gmh(rCtx, b - t);
      if (needsPathBasedRectangle(rCtx)) {
        const build = (c) => {
          c.beginPath();
          c.rect(x, y, w, h);
        };
        build(ctx);
        fillShapeExactOrFast(rCtx, build);
        strokeShapeExactOrFast(rCtx, build);
      } else {
        applyBrush(ctx, state);
        ctx.fillRect(x, y, w, h);
        applyPen(ctx, state);
        ctx.strokeRect(x, y, w, h);
      }
    }
  }
  return true;
}
function handleRoundRect(rCtx, dataOff, recSize) {
  const { ctx, view, inPath } = rCtx;
  if (recSize >= 32) {
    const l = view.getInt32(dataOff, true);
    const t = view.getInt32(dataOff + 4, true);
    const r = view.getInt32(dataOff + 8, true);
    const b = view.getInt32(dataOff + 12, true);
    const cornerW = view.getInt32(dataOff + 16, true);
    const cornerH = view.getInt32(dataOff + 20, true);
    const rotated = hasWorldRotation(rCtx);
    const rw = Math.abs(rotated ? cornerW / 2 : gmw(rCtx, cornerW) / 2);
    const rh = Math.abs(rotated ? cornerH / 2 : gmh(rCtx, cornerH) / 2);
    const x1 = rotated ? l : gmx(rCtx, l);
    const y1 = rotated ? t : gmy(rCtx, t);
    const w = rotated ? r - l : gmw(rCtx, r - l);
    const h = rotated ? b - t : gmh(rCtx, b - t);
    const map = (x, y) => rotated ? gmapPoint(rCtx, x, y) : { x, y };
    const drawRoundRect = (c) => {
      const radius = Math.min(rw, rh, Math.abs(w) / 2, Math.abs(h) / 2);
      const start = map(x1 + radius, y1);
      c.moveTo(start.x, start.y);
      if (rotated) {
        const corners = [
          [x1 + w - radius, y1],
          [x1 + w, y1 + radius],
          [x1 + w, y1 + h - radius],
          [x1 + w - radius, y1 + h],
          [x1 + radius, y1 + h],
          [x1, y1 + h - radius],
          [x1, y1 + radius],
          [x1 + radius, y1]
        ];
        for (const [px, py] of corners) {
          const q = map(px, py);
          c.lineTo(q.x, q.y);
        }
      } else {
        const corner2 = map(x1 + w - radius, y1);
        c.lineTo(corner2.x, corner2.y);
        const arc1a = map(x1 + w, y1);
        const arc1b = map(x1 + w, y1 + radius);
        c.arcTo(arc1a.x, arc1a.y, arc1b.x, arc1b.y, radius);
        const corner3 = map(x1 + w, y1 + h - radius);
        c.lineTo(corner3.x, corner3.y);
        const arc2a = map(x1 + w, y1 + h);
        const arc2b = map(x1 + w - radius, y1 + h);
        c.arcTo(arc2a.x, arc2a.y, arc2b.x, arc2b.y, radius);
        const corner4 = map(x1 + radius, y1 + h);
        c.lineTo(corner4.x, corner4.y);
        const arc3a = map(x1, y1 + h);
        const arc3b = map(x1, y1 + h - radius);
        c.arcTo(arc3a.x, arc3a.y, arc3b.x, arc3b.y, radius);
        const corner1 = map(x1, y1 + radius);
        c.lineTo(corner1.x, corner1.y);
        const arc4a = map(x1, y1);
        const arc4b = map(x1 + radius, y1);
        c.arcTo(arc4a.x, arc4a.y, arc4b.x, arc4b.y, radius);
      }
      c.closePath();
    };
    if (inPath) {
      drawRoundRect(gdiPathRecorder(rCtx));
    } else {
      const build = (c) => {
        c.beginPath();
        drawRoundRect(c);
      };
      build(ctx);
      fillShapeExactOrFast(rCtx, build);
      strokeShapeExactOrFast(rCtx, build);
    }
  }
  return true;
}
function handleEllipse(rCtx, dataOff, recSize) {
  const { ctx, view, inPath } = rCtx;
  if (recSize >= 24) {
    const l = view.getInt32(dataOff, true);
    const t = view.getInt32(dataOff + 4, true);
    const r = view.getInt32(dataOff + 8, true);
    const b = view.getInt32(dataOff + 12, true);
    const params = hasWorldRotation(rCtx) ? gdiEllipseParams(rCtx, (l + r) / 2, (t + b) / 2, Math.abs(r - l) / 2, Math.abs(b - t) / 2) : {
      cx: gmx(rCtx, (l + r) / 2),
      cy: gmy(rCtx, (t + b) / 2),
      rx: Math.abs(gmw(rCtx, r - l)) / 2,
      ry: Math.abs(gmh(rCtx, b - t)) / 2,
      rotation: 0
    };
    if (inPath) {
      gdiPathRecorder(rCtx).ellipse(params.cx, params.cy, params.rx, params.ry, params.rotation, 0, Math.PI * 2);
    } else {
      const build = (c) => {
        c.beginPath();
        c.ellipse(params.cx, params.cy, params.rx, params.ry, params.rotation, 0, Math.PI * 2);
      };
      build(ctx);
      fillShapeExactOrFast(rCtx, build);
      strokeShapeExactOrFast(rCtx, build);
    }
  }
  return true;
}
function handleArcFamily(rCtx, recType, dataOff, recSize) {
  const { ctx, view, state, inPath } = rCtx;
  if (recSize >= 40) {
    const l = view.getInt32(dataOff, true);
    const t = view.getInt32(dataOff + 4, true);
    const r = view.getInt32(dataOff + 8, true);
    const b = view.getInt32(dataOff + 12, true);
    const startX = view.getInt32(dataOff + 16, true);
    const startY = view.getInt32(dataOff + 20, true);
    const endX = view.getInt32(dataOff + 24, true);
    const endY = view.getInt32(dataOff + 28, true);
    const cxA = (l + r) / 2;
    const cyA = (t + b) / 2;
    const rx = Math.abs(r - l) / 2;
    const ry = Math.abs(b - t) / 2;
    const startAngle = Math.atan2((startY - cyA) / (ry || 1), (startX - cxA) / (rx || 1));
    const endAngle = Math.atan2((endY - cyA) / (ry || 1), (endX - cxA) / (rx || 1));
    const rotated = hasWorldRotation(rCtx);
    const params = rotated ? gdiEllipseParams(rCtx, cxA, cyA, rx, ry) : {
      cx: gmx(rCtx, cxA),
      cy: gmy(rCtx, cyA),
      rx: Math.abs(gmw(rCtx, rx)),
      ry: Math.abs(gmh(rCtx, ry)),
      rotation: 0
    };
    const isArcTo = recType === EMR_ARCTO;
    const needsFill = recType === EMR_PIE || recType === EMR_CHORD;
    const startPoint = rotated ? gmapPoint(rCtx, cxA + rx * Math.cos(startAngle), cyA + ry * Math.sin(startAngle)) : { x: params.cx + params.rx * Math.cos(startAngle), y: params.cy + params.ry * Math.sin(startAngle) };
    const build = (c) => {
      if (recType === EMR_PIE) {
        c.moveTo(params.cx, params.cy);
      }
      if (isArcTo) {
        c.lineTo(startPoint.x, startPoint.y);
      }
      c.ellipse(params.cx, params.cy, params.rx, params.ry, params.rotation, startAngle, endAngle, false);
      if (needsFill) {
        c.closePath();
      }
    };
    if (inPath) {
      build(gdiPathRecorder(rCtx));
    } else {
      ctx.beginPath();
      build(ctx);
      const buildWithPath = (c) => {
        c.beginPath();
        build(c);
      };
      if (needsFill) {
        fillShapeExactOrFast(rCtx, buildWithPath);
      }
      strokeShapeExactOrFast(rCtx, buildWithPath);
    }
    if (isArcTo) {
      state.curX = endX;
      state.curY = endY;
    }
  }
  return true;
}
function handleEmfGdiShapeRecord(rCtx, recType, dataOff, recSize) {
  switch (recType) {
    case EMR_SETPIXELV:
      return handleSetPixelV(rCtx, dataOff, recSize);
    case EMR_MOVETOEX:
      return handleMoveToEx(rCtx, dataOff, recSize);
    case EMR_LINETO:
      return handleLineTo(rCtx, dataOff, recSize);
    case EMR_RECTANGLE:
      return handleRectangle(rCtx, dataOff, recSize);
    case EMR_ROUNDRECT:
      return handleRoundRect(rCtx, dataOff, recSize);
    case EMR_ELLIPSE:
      return handleEllipse(rCtx, dataOff, recSize);
    case EMR_ARC:
    case EMR_ARCTO:
    case EMR_CHORD:
    case EMR_PIE:
      return handleArcFamily(rCtx, recType, dataOff, recSize);
    default:
      return false;
  }
}

// src/emf-gdi-stretch.ts
var BLACKONWHITE = 1;
var WHITEONBLACK = 2;
var HALFTONE = 4;
function gdiNearest(i, srcLen, dstLen) {
  const k = Math.floor((2 * i + 1) * srcLen / (2 * dstLen));
  return Math.max(0, Math.min(srcLen - 1, k));
}
function axisSamples(srcStart, srcLen, dstLen, reverse, combine) {
  const out = [];
  const at = (k) => reverse ? srcStart + srcLen - 1 - k : srcStart + k;
  if (dstLen <= 0 || srcLen <= 0) {
    return out;
  }
  let prev = -1;
  for (let i = 0; i < dstLen; i++) {
    const c = gdiNearest(i, srcLen, dstLen);
    const run = [];
    const from = combine && dstLen < srcLen ? prev + 1 : c;
    for (let k = from; k <= c; k++) {
      run.push(at(k));
    }
    out.push(run);
    prev = c;
  }
  return out;
}
function stretchGdi(src, sx, sy, sw, sh, dw, dh, mode) {
  const W = Math.max(0, Math.round(Math.abs(dw)));
  const H = Math.max(0, Math.round(Math.abs(dh)));
  const flipX = dw < 0 !== sw < 0;
  const flipY = dh < 0 !== sh < 0;
  const combine = mode === BLACKONWHITE || mode === WHITEONBLACK;
  const cols = axisSamples(Math.round(Math.min(sx, sx + sw)), Math.round(Math.abs(sw)), W, flipX, combine);
  const rows = axisSamples(Math.round(Math.min(sy, sy + sh)), Math.round(Math.abs(sh)), H, flipY, combine);
  const data = new Uint8ClampedArray(W * H * 4);
  const s = src.data;
  const read = (x, y) => {
    if (x < 0 || y < 0 || x >= src.width || y >= src.height) {
      return 0;
    }
    const i = (y * src.width + x) * 4;
    return s[i] << 16 | s[i + 1] << 8 | s[i + 2];
  };
  for (let y = 0; y < H; y++) {
    const ys = rows[y] ?? [];
    for (let x = 0; x < W; x++) {
      const xs = cols[x] ?? [];
      let v = mode === BLACKONWHITE ? 16777215 : 0;
      let first = true;
      for (const yy of ys) {
        for (const xx of xs) {
          const p = read(xx, yy);
          if (mode === BLACKONWHITE) {
            v &= p;
          } else if (mode === WHITEONBLACK) {
            v |= p;
          } else if (first) {
            v = p;
          }
          first = false;
        }
      }
      const o = (y * W + x) * 4;
      data[o] = v >> 16 & 255;
      data[o + 1] = v >> 8 & 255;
      data[o + 2] = v & 255;
      data[o + 3] = 255;
    }
  }
  return { width: W, height: H, data };
}

// src/emf-gdi-draw-bitmap.ts
function patternOperand(rCtx, brush) {
  if (brush.kind === "solid") {
    return brush.rgb;
  }
  if (brush.kind === "none") {
    return 0;
  }
  const { state, bounds } = rCtx;
  const sx = rCtx.sx || 1;
  const sy = rCtx.sy || 1;
  return (x, y) => sampleTile(
    brush,
    Math.floor(bounds.left + (x + 0.5) / sx),
    Math.floor(bounds.top + (y + 0.5) / sy),
    state.brushOrgX,
    state.brushOrgY
  );
}
function drawSourceMapped(target, decoded, req, offsetX, offsetY, mode) {
  const dLeft = Math.min(req.dx, req.dx + req.dw) - offsetX;
  const dTop = Math.min(req.dy, req.dy + req.dh) - offsetY;
  if (mode !== HALFTONE) {
    const px = stretchGdi(decoded.pixels, req.sx, req.sy, req.sw, req.sh, req.dw, req.dh, mode);
    const tile = createTempCanvas(px.width, px.height);
    if (!tile) {
      return;
    }
    canvasPutImageData(tile.ctx, createImageDataCompat(px.data, px.width, px.height), 0, 0);
    target.save();
    target.globalCompositeOperation = "source-over";
    canvasDrawImage(target, tile.canvas, Math.round(dLeft), Math.round(dTop), px.width, px.height);
    target.restore();
    return;
  }
  const flipX = req.dw < 0 !== req.sw < 0;
  const flipY = req.dh < 0 !== req.sh < 0;
  const adw = Math.abs(req.dw);
  const adh = Math.abs(req.dh);
  target.save();
  target.imageSmoothingEnabled = true;
  target.transform(
    flipX ? -1 : 1,
    0,
    0,
    flipY ? -1 : 1,
    flipX ? dLeft * 2 + adw : 0,
    flipY ? dTop * 2 + adh : 0
  );
  const draw = target.drawImage;
  draw.call(
    target,
    decoded.canvas,
    Math.min(req.sx, req.sx + req.sw),
    Math.min(req.sy, req.sy + req.sh),
    Math.abs(req.sw),
    Math.abs(req.sh),
    dLeft,
    dTop,
    adw,
    adh
  );
  target.restore();
}
function decodeSource(rCtx, req) {
  if (!req.source) {
    return null;
  }
  const image = decodeDibToImageData(rCtx.view, req.source.bmi, req.source.bits, req.source.cbBits);
  if (!image) {
    return null;
  }
  const temp = createTempCanvas(image.width, image.height);
  if (!temp) {
    return null;
  }
  canvasPutImageData(temp.ctx, image, 0, 0);
  let { sy } = req;
  if (req.dibOrigin === "bottom-left" && rCtx.view.getInt32(req.source.bmi + 8, true) > 0) {
    sy = image.height - sy - req.sh;
  }
  return {
    decoded: { pixels: image, canvas: temp.canvas },
    req: { ...req, sy }
  };
}
function fillRectWith(ctx, style, gco, req) {
  const prevGco = ctx.globalCompositeOperation;
  const prevFill = ctx.fillStyle;
  ctx.globalCompositeOperation = gco;
  ctx.fillStyle = style;
  ctx.fillRect(req.dx, req.dy, req.dw, req.dh);
  ctx.globalCompositeOperation = prevGco;
  ctx.fillStyle = prevFill;
}
function runTernary(rCtx, req, index, usesP, usesS) {
  const { ctx } = rCtx;
  const rect = clampPositiveRect(req.dx, req.dy, req.dw, req.dh, rCtx.canvasW, rCtx.canvasH);
  if (!rect) {
    return;
  }
  if (typeof ctx.getImageData !== "function") {
    return;
  }
  const brush = realizeBrush(rCtx.state);
  if (usesP && brush.kind === "none") {
    return;
  }
  const layer = createTempCanvas(rect.w, rect.h);
  if (!layer) {
    return;
  }
  let src = null;
  if (usesS) {
    const decoded = decodeSource(rCtx, req);
    if (!decoded) {
      return;
    }
    drawSourceMapped(layer.ctx, decoded.decoded, decoded.req, rect.x, rect.y, rCtx.state.stretchBltMode);
    src = canvasGetImageData(layer.ctx, 0, 0, rect.w, rect.h);
  }
  const dst = canvasGetImageData(ctx, rect.x, rect.y, rect.w, rect.h);
  applyRop3(dst, src, patternOperand(rCtx, brush), index, rect.x, rect.y);
  canvasPutImageData(layer.ctx, dst, 0, 0);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  canvasDrawImage(ctx, layer.canvas, rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}
function executeRotatedBlit(rCtx, logDx, logDy, logDw, logDh, rop, source, sx, sy, sw, sh, dibOrigin) {
  const { ctx } = rCtx;
  const index = rop3Index(rop);
  if (index === 170) {
    return;
  }
  const operands = rop3Operands(index);
  if (typeof ctx.getImageData !== "function") {
    return;
  }
  const m = gdiDeviceMatrix(rCtx);
  const origin = gmapPoint(rCtx, logDx, logDy);
  const scaleX = Math.hypot(m[0], m[1]);
  const scaleY = Math.hypot(m[2], m[3]);
  const dw = Math.max(1, Math.min(MAX_CANVAS_DIMENSION, Math.round(scaleX * Math.abs(logDw)) || 1));
  const dh = Math.max(1, Math.min(MAX_CANVAS_DIMENSION, Math.round(scaleY * Math.abs(logDh)) || 1));
  const signDw = logDw < 0 ? -1 : 1;
  const signDh = logDh < 0 ? -1 : 1;
  const exX = m[0] * signDw * Math.abs(logDw) / dw;
  const exY = m[1] * signDw * Math.abs(logDw) / dw;
  const eyX = m[2] * signDh * Math.abs(logDh) / dh;
  const eyY = m[3] * signDh * Math.abs(logDh) / dh;
  const corners = [
    origin,
    { x: origin.x + exX * dw, y: origin.y + exY * dw },
    { x: origin.x + eyX * dh, y: origin.y + eyY * dh },
    { x: origin.x + exX * dw + eyX * dh, y: origin.y + exY * dw + eyY * dh }
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of corners) {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x);
    maxY = Math.max(maxY, c.y);
  }
  const bx = Math.max(0, Math.floor(minX));
  const by = Math.max(0, Math.floor(minY));
  const bw = Math.min(rCtx.canvasW, Math.ceil(maxX)) - bx;
  const bh = Math.min(rCtx.canvasH, Math.ceil(maxY)) - by;
  if (bw <= 0 || bh <= 0) {
    return;
  }
  const brush = realizeBrush(rCtx.state);
  if (operands.usesP && brush.kind === "none") {
    return;
  }
  const pattern = patternOperand(rCtx, brush);
  let src = null;
  if (operands.usesS) {
    const localReq = {
      plan: { kind: "ternary", index, operands },
      dx: 0,
      dy: 0,
      dw: signDw * dw,
      dh: signDh * dh,
      source,
      sx,
      sy,
      sw,
      sh,
      dibOrigin
    };
    const decoded = decodeSource(rCtx, localReq);
    if (!decoded) {
      return;
    }
    const srcLayer = createTempCanvas(dw, dh);
    if (!srcLayer) {
      return;
    }
    drawSourceMapped(srcLayer.ctx, decoded.decoded, decoded.req, 0, 0, rCtx.state.stretchBltMode);
    src = canvasGetImageData(srcLayer.ctx, 0, 0, dw, dh);
  }
  const destBBox = canvasGetImageData(ctx, bx, by, bw, bh);
  const dd = destBBox.data;
  const out = new Uint8ClampedArray(dw * dh * 4);
  for (let ly = 0; ly < dh; ly++) {
    for (let lx = 0; lx < dw; lx++) {
      const devX = origin.x + exX * lx + eyX * ly;
      const devY = origin.y + exY * lx + eyY * ly;
      const oi = (ly * dw + lx) * 4;
      const ix = Math.round(devX) - bx;
      const iy = Math.round(devY) - by;
      if (ix < 0 || iy < 0 || ix >= bw || iy >= bh) {
        continue;
      }
      const di = (iy * bw + ix) * 4;
      const dv = dd[di] << 16 | dd[di + 1] << 8 | dd[di + 2];
      const si = (ly * dw + lx) * 4;
      const sv = src ? src.data[si] << 16 | src.data[si + 1] << 8 | src.data[si + 2] : 0;
      const pv = typeof pattern === "function" ? pattern(Math.round(devX), Math.round(devY)) : pattern;
      const r = evalRop3(index, pv, sv, dv);
      out[oi] = r >> 16 & 255;
      out[oi + 1] = r >> 8 & 255;
      out[oi + 2] = r & 255;
      out[oi + 3] = 255;
    }
  }
  const outLayer = createTempCanvas(dw, dh);
  if (!outLayer) {
    return;
  }
  canvasPutImageData(outLayer.ctx, createImageDataCompat(out, dw, dh), 0, 0);
  ctx.save();
  ctx.setTransform(exX, exY, eyX, eyY, origin.x, origin.y);
  ctx.imageSmoothingEnabled = false;
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  canvasDrawImage(ctx, outLayer.canvas, 0, 0, dw, dh);
  ctx.restore();
}
function alignMirroredDest(rCtx, req) {
  const pxX = rCtx.useMappingMode ? 1 : rCtx.sx;
  const pxY = rCtx.useMappingMode ? 1 : rCtx.sy;
  return {
    ...req,
    dx: req.dw < 0 ? req.dx + pxX : req.dx,
    dy: req.dh < 0 ? req.dy + pxY : req.dy
  };
}
function executeBlit(rCtx, request) {
  const { ctx } = rCtx;
  const req = alignMirroredDest(rCtx, request);
  const plan = req.plan;
  switch (plan.kind) {
    case "noop":
      return;
    case "solid":
      fillRectWith(ctx, plan.color === "black" ? "#000000" : "#ffffff", "source-over", req);
      return;
    case "invert-dest":
      fillRectWith(ctx, "#ffffff", "difference", req);
      return;
    case "copy": {
      const decoded = decodeSource(rCtx, req);
      if (decoded) {
        drawSourceMapped(ctx, decoded.decoded, decoded.req, 0, 0, rCtx.state.stretchBltMode);
      }
      return;
    }
    case "ternary": {
      const brush = realizeBrush(rCtx.state);
      if (plan.index === 240 && brush.kind !== "tile") {
        if (brush.kind === "solid") {
          fillRectWith(ctx, rCtx.state.brushColor, "source-over", req);
        }
        return;
      }
      runTernary(rCtx, req, plan.index, plan.operands.usesP, plan.operands.usesS);
    }
  }
}
function sourceOf(offset, offBmi, cbBmi, offBits, cbBits) {
  return offBmi > 0 && cbBmi > 0 && offBits > 0 && cbBits > 0 ? { bmi: offset + offBmi, bits: offset + offBits, cbBits } : null;
}
function handleBlt(rCtx, offset, dataOff, recSize, stretch) {
  const { view } = rCtx;
  if (recSize < (stretch ? 108 : 96)) {
    return true;
  }
  const xDest = view.getInt32(dataOff + 16, true);
  const yDest = view.getInt32(dataOff + 20, true);
  const cxDest = view.getInt32(dataOff + 24, true);
  const cyDest = view.getInt32(dataOff + 28, true);
  const rop = view.getUint32(dataOff + 32, true);
  const xSrc = view.getInt32(dataOff + 36, true);
  const ySrc = view.getInt32(dataOff + 40, true);
  const m11 = view.getFloat32(dataOff + 44, true);
  const m12 = view.getFloat32(dataOff + 48, true);
  const m21 = view.getFloat32(dataOff + 52, true);
  const m22 = view.getFloat32(dataOff + 56, true);
  const mdx = view.getFloat32(dataOff + 60, true);
  const mdy = view.getFloat32(dataOff + 64, true);
  const cxSrc = stretch ? view.getInt32(dataOff + 92, true) : cxDest;
  const cySrc = stretch ? view.getInt32(dataOff + 96, true) : cyDest;
  const source = recSize >= 100 ? sourceOf(
    offset,
    view.getUint32(dataOff + 76, true),
    view.getUint32(dataOff + 80, true),
    view.getUint32(dataOff + 84, true),
    view.getUint32(dataOff + 88, true)
  ) : null;
  const identity = m11 === 0 && m22 === 0 && m12 === 0 && m21 === 0;
  const a = identity ? 1 : m11;
  const d = identity ? 1 : m22;
  const srcRect = {
    sx: a * xSrc + (identity ? 0 : m21 * ySrc + mdx),
    sy: d * ySrc + (identity ? 0 : m12 * xSrc + mdy),
    sw: a * cxSrc,
    sh: d * cySrc
  };
  if (hasWorldRotation(rCtx)) {
    executeRotatedBlit(
      rCtx,
      xDest,
      yDest,
      cxDest,
      cyDest,
      rop,
      source,
      srcRect.sx,
      srcRect.sy,
      srcRect.sw,
      srcRect.sh,
      "top-left"
    );
    return true;
  }
  executeBlit(rCtx, {
    plan: classifyRop3(rop),
    dx: gmx(rCtx, xDest),
    dy: gmy(rCtx, yDest),
    dw: gmw(rCtx, cxDest),
    dh: gmh(rCtx, cyDest),
    source,
    ...srcRect,
    dibOrigin: "top-left"
  });
  return true;
}
function handleStretchDibits(rCtx, offset, dataOff, recSize) {
  const { view } = rCtx;
  if (recSize < 80) {
    return true;
  }
  const xDest = view.getInt32(dataOff + 16, true);
  const yDest = view.getInt32(dataOff + 20, true);
  const cxDest = view.getInt32(dataOff + 64, true);
  const cyDest = view.getInt32(dataOff + 68, true);
  const rop = view.getUint32(dataOff + 60, true);
  const source = sourceOf(
    offset,
    view.getUint32(dataOff + 40, true),
    view.getUint32(dataOff + 44, true),
    view.getUint32(dataOff + 48, true),
    view.getUint32(dataOff + 52, true)
  );
  const sx = view.getInt32(dataOff + 24, true);
  const sy = view.getInt32(dataOff + 28, true);
  const sw = view.getInt32(dataOff + 32, true);
  const sh = view.getInt32(dataOff + 36, true);
  if (hasWorldRotation(rCtx)) {
    executeRotatedBlit(rCtx, xDest, yDest, cxDest, cyDest, rop, source, sx, sy, sw, sh, "bottom-left");
    return true;
  }
  executeBlit(rCtx, {
    plan: classifyRop3(rop),
    dx: gmx(rCtx, xDest),
    dy: gmy(rCtx, yDest),
    dw: gmw(rCtx, cxDest),
    dh: gmh(rCtx, cyDest),
    source,
    sx,
    sy,
    sw,
    sh,
    dibOrigin: "bottom-left"
  });
  return true;
}
function handleEmfGdiBitmapRecord(rCtx, recType, offset, dataOff, recSize) {
  switch (recType) {
    case EMR_BITBLT:
      return handleBlt(rCtx, offset, dataOff, recSize, false);
    case EMR_STRETCHBLT:
      return handleBlt(rCtx, offset, dataOff, recSize, true);
    case EMR_STRETCHDIBITS:
      return handleStretchDibits(rCtx, offset, dataOff, recSize);
    default:
      return false;
  }
}

// src/emf-gdi-draw-text.ts
function readDxArray(view, offset, dataOff, nChars, viewEnd) {
  const offDx = view.getUint32(dataOff + 64, true);
  if (offDx === 0) {
    return null;
  }
  const start = offset + offDx;
  const end = start + nChars * 4;
  if (start < 0 || end > viewEnd) {
    return null;
  }
  const dx = [];
  for (let i = 0; i < nChars; i++) {
    dx.push(view.getUint32(start + i * 4, true));
  }
  return dx;
}
function horizontalAlign(textAlign) {
  if (textAlign & 2) {
    return "right";
  }
  if (textAlign & 6) {
    return "center";
  }
  return "left";
}
function verticalBaseline(textAlign) {
  const vAlign = textAlign & 24;
  return vAlign === 24 ? "alphabetic" : vAlign === 8 ? "bottom" : "top";
}
function paintRun(ctx, state, text, dxDevice, startX, y, align, fontScale) {
  const totalWidth = dxDevice ? totalGlyphAdvance(dxDevice) : ctx.measureText(text).width;
  const runStartX = dxDevice ? startX + alignmentStartOffset(totalWidth, align) : startX;
  if (state.bkMode === 2) {
    const bgH = fontSizePx(state, fontScale);
    const prevFill = ctx.fillStyle;
    ctx.fillStyle = state.bkColor;
    ctx.fillRect(runStartX, y - bgH, totalWidth, bgH);
    ctx.fillStyle = prevFill;
  }
  ctx.fillStyle = state.textColor;
  if (dxDevice) {
    const offsets = cumulativeGlyphOffsets(dxDevice);
    const prevAlign = ctx.textAlign;
    ctx.textAlign = "left";
    for (let i = 0; i < text.length && i < offsets.length; i++) {
      ctx.fillText(text[i], runStartX + offsets[i], y);
    }
    ctx.textAlign = prevAlign;
  } else {
    ctx.fillText(text, startX, y);
  }
  if (state.fontUnderline || state.fontStrikeOut) {
    drawTextDecorations(ctx, state, runStartX, y, totalWidth, fontScale);
  }
}
function handleExtTextOutW(rCtx, offset, dataOff, recSize) {
  const { ctx, view, state } = rCtx;
  if (recSize < 76) {
    return true;
  }
  const refX = view.getInt32(dataOff + 28, true);
  const refY = view.getInt32(dataOff + 32, true);
  const nChars = view.getUint32(dataOff + 36, true);
  const offString = view.getUint32(dataOff + 40, true);
  const viewEnd = view.byteLength;
  if (nChars === 0 || offString === 0 || offset + offString + nChars * 2 > viewEnd) {
    return true;
  }
  const text = readUtf16LE(view, offset + offString, nChars);
  if (text.length === 0) {
    return true;
  }
  const rotated = hasWorldRotation(rCtx);
  const m = rotated ? gdiDeviceMatrix(rCtx) : null;
  const fontScale = m ? Math.hypot(m[2], m[3]) : Math.abs(gmh(rCtx, 1));
  const advanceScale = m ? Math.hypot(m[0], m[1]) : null;
  applyFont(ctx, state, fontScale);
  const align = horizontalAlign(state.textAlign);
  ctx.textBaseline = verticalBaseline(state.textAlign);
  ctx.textAlign = align === "center" ? "center" : align === "right" ? "right" : "left";
  const dxLogical = readDxArray(view, offset, dataOff, nChars, viewEnd);
  const dxDevice = dxLogical ? dxLogical.map((v) => advanceScale !== null ? v * advanceScale : gmw(rCtx, v)) : null;
  if (dxDevice) {
    ctx.textAlign = "left";
  }
  const basePoint = m ? gmapPoint(rCtx, refX, refY) : { x: gmx(rCtx, refX), y: gmy(rCtx, refY) };
  const worldAngle = m ? Math.atan2(m[1], m[0]) : 0;
  const radians = worldAngle + escapementToCanvasRadians(state.fontEscapementTenthDeg);
  if (radians !== 0) {
    ctx.save();
    ctx.translate(basePoint.x, basePoint.y);
    ctx.rotate(radians);
    paintRun(ctx, state, text, dxDevice, 0, 0, align, fontScale);
    ctx.restore();
  } else {
    paintRun(ctx, state, text, dxDevice, basePoint.x, basePoint.y, align, fontScale);
  }
  return true;
}
function handleEmfGdiDrawTextRecord(rCtx, recType, offset, dataOff, recSize) {
  if (recType === EMR_EXTTEXTOUTW) {
    return handleExtTextOutW(rCtx, offset, dataOff, recSize);
  }
  return false;
}

// src/emf-clip-region.ts
var CLIP_HUGE = 1 << 24;
function rectClipShape(x, y, w, h) {
  return { cmds: [{ op: "rect", x, y, w, h }], fillRule: "nonzero", simple: true };
}
function rectsClipShape(rects) {
  return {
    cmds: rects.map((r) => ({ op: "rect", x: r.x, y: r.y, w: r.w, h: r.h })),
    fillRule: "nonzero",
    simple: true
  };
}
function emptyClipShape() {
  return { cmds: [{ op: "rect", x: 0, y: 0, w: 0, h: 0 }], fillRule: "nonzero", simple: true };
}
function translateClipShape(shape, dx, dy) {
  return {
    ...shape,
    cmds: shape.cmds.map((c) => {
      switch (c.op) {
        case "rect":
          return { ...c, x: c.x + dx, y: c.y + dy };
        case "moveTo":
        case "lineTo":
          return { ...c, x: c.x + dx, y: c.y + dy };
        case "bezierCurveTo":
          return {
            ...c,
            cp1x: c.cp1x + dx,
            cp1y: c.cp1y + dy,
            cp2x: c.cp2x + dx,
            cp2y: c.cp2y + dy,
            x: c.x + dx,
            y: c.y + dy
          };
        case "closePath":
          return c;
      }
    })
  };
}
function translateClipRegion(region, dx, dy) {
  if (!region) {
    return null;
  }
  return region.map((s) => translateClipShape(s, dx, dy));
}
function isComposable(shape) {
  return shape.simple && shape.fillRule === "nonzero";
}
function invertClipShape(shape) {
  return {
    cmds: [
      { op: "rect", x: -CLIP_HUGE, y: -CLIP_HUGE, w: 2 * CLIP_HUGE, h: 2 * CLIP_HUGE },
      ...shape.cmds
    ],
    fillRule: "evenodd",
    simple: false
  };
}
function combineClip(current, shape, op) {
  switch (op) {
    case "replace":
      return { region: [shape], exact: true };
    case "intersect":
      return { region: current ? [...current, shape] : [shape], exact: true };
    case "exclude": {
      if (!isComposable(shape)) {
        return { region: current ? [...current, shape] : [shape], exact: false };
      }
      const inv = invertClipShape(shape);
      return { region: current ? [...current, inv] : [inv], exact: true };
    }
    case "union": {
      if (!current) {
        return { region: null, exact: true };
      }
      if (current.length === 1 && isComposable(current[0]) && isComposable(shape)) {
        return {
          region: [
            { cmds: [...current[0].cmds, ...shape.cmds], fillRule: "nonzero", simple: false }
          ],
          exact: false
        };
      }
      return { region: current, exact: false };
    }
    case "xor": {
      if (!current) {
        if (isComposable(shape)) {
          return { region: [invertClipShape(shape)], exact: true };
        }
        return { region: [shape], exact: false };
      }
      if (current.length === 1 && isComposable(current[0]) && isComposable(shape)) {
        return {
          region: [
            { cmds: [...current[0].cmds, ...shape.cmds], fillRule: "evenodd", simple: false }
          ],
          exact: true
        };
      }
      if (isComposable(shape)) {
        return { region: [...current, invertClipShape(shape)], exact: false };
      }
      return { region: [...current, shape], exact: false };
    }
    case "complement": {
      if (!current) {
        return { region: [emptyClipShape()], exact: true };
      }
      if (current.length === 1 && isComposable(current[0])) {
        return { region: [shape, invertClipShape(current[0])], exact: true };
      }
      return { region: [shape], exact: false };
    }
  }
}
function combineClipRegions(current, incoming, op) {
  if (op === "replace") {
    return { region: incoming, exact: true };
  }
  if (incoming && incoming.length === 1) {
    return combineClip(current, incoming[0], op);
  }
  if (!incoming) {
    switch (op) {
      case "intersect":
        return { region: current, exact: true };
      case "union":
        return { region: null, exact: true };
      case "exclude":
        return { region: [emptyClipShape()], exact: true };
      case "xor":
      case "complement": {
        if (!current) {
          return { region: [emptyClipShape()], exact: true };
        }
        if (current.length === 1) {
          return combineClip(null, current[0], "exclude");
        }
        return { region: current, exact: false };
      }
    }
  }
  switch (op) {
    case "intersect":
      return { region: current ? [...current, ...incoming] : incoming, exact: true };
    case "union":
      return { region: current, exact: false };
    case "xor":
      return { region: current ?? incoming, exact: false };
    case "exclude":
      return { region: current, exact: false };
    case "complement": {
      if (!current) {
        return { region: [emptyClipShape()], exact: true };
      }
      if (current.length === 1) {
        return combineClip(incoming, current[0], "exclude");
      }
      return { region: incoming, exact: false };
    }
  }
}
function replayClipCmds(ctx, cmds) {
  for (const c of cmds) {
    switch (c.op) {
      case "rect":
        ctx.rect(c.x, c.y, c.w, c.h);
        break;
      case "moveTo":
        ctx.moveTo(c.x, c.y);
        break;
      case "lineTo":
        ctx.lineTo(c.x, c.y);
        break;
      case "bezierCurveTo":
        ctx.bezierCurveTo(c.cp1x, c.cp1y, c.cp2x, c.cp2y, c.x, c.y);
        break;
      case "closePath":
        ctx.closePath();
        break;
    }
  }
}
function applyClipShapes(ctx, shapes) {
  for (const s of shapes) {
    ctx.beginPath();
    replayClipCmds(ctx, s.cmds);
    try {
      ctx.clip(s.fillRule);
    } catch {
    }
  }
}
function reapplyClipRegion(holder, region, identityTransform = false) {
  const { ctx } = holder;
  while (holder.clipSaveDepth > 0) {
    ctx.restore();
    holder.clipSaveDepth--;
  }
  if (region) {
    ctx.save();
    holder.clipSaveDepth = 1;
    if (identityTransform) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    applyClipShapes(ctx, region);
  }
}

// src/emf-gdi-clip-records.ts
function gdiCombineClip(rCtx, shape, op) {
  const { ctx } = rCtx;
  if (rCtx.clipUntracked && op !== "replace") {
    switch (op) {
      case "intersect":
      case "complement": {
        ctx.save();
        rCtx.clipSaveDepth++;
        applyClipShapes(ctx, [shape]);
        return;
      }
      case "exclude":
      case "xor": {
        const inv = combineClip(null, shape, "exclude");
        ctx.save();
        rCtx.clipSaveDepth++;
        applyClipShapes(ctx, inv.region ?? [shape]);
        return;
      }
      case "union":
        return;
    }
  }
  const res = combineClip(op === "replace" ? null : rCtx.clipRegion ?? null, shape, op);
  if (!res.exact) ;
  rCtx.clipRegion = res.region;
  rCtx.clipUntracked = false;
  reapplyClipRegion(rCtx, res.region);
}
function readClipRectShape(rCtx, dataOff) {
  const { view } = rCtx;
  const left = view.getInt32(dataOff, true);
  const top = view.getInt32(dataOff + 4, true);
  const right = view.getInt32(dataOff + 8, true);
  const bottom = view.getInt32(dataOff + 12, true);
  return rectClipShape(
    gmx(rCtx, left),
    gmy(rCtx, top),
    gmw(rCtx, right - left),
    gmh(rCtx, bottom - top)
  );
}
function handleIntersectClipRect(rCtx, dataOff, recSize) {
  if (recSize >= 24) {
    gdiCombineClip(rCtx, readClipRectShape(rCtx, dataOff), "intersect");
  }
  return true;
}
function handleExcludeClipRect(rCtx, dataOff, recSize) {
  if (recSize >= 24) {
    gdiCombineClip(rCtx, readClipRectShape(rCtx, dataOff), "exclude");
  }
  return true;
}
var RGN_MODE_OPS = {
  1: "intersect",
  // RGN_AND
  2: "union",
  // RGN_OR
  3: "xor",
  // RGN_XOR
  4: "exclude",
  // RGN_DIFF
  5: "replace"
  // RGN_COPY
};
function handleExtSelectClipRgn(rCtx, dataOff, recSize) {
  const { view } = rCtx;
  if (recSize < 16) {
    return true;
  }
  const cbRgnData = view.getUint32(dataOff, true);
  const iMode = view.getUint32(dataOff + 4, true);
  const op = RGN_MODE_OPS[iMode];
  if (!op) {
    return true;
  }
  if (cbRgnData === 0) {
    if (op === "replace") {
      rCtx.clipRegion = null;
      rCtx.clipUntracked = false;
      reapplyClipRegion(rCtx, null);
    }
    return true;
  }
  const rgnStart = dataOff + 8;
  if (cbRgnData < 32) {
    return true;
  }
  const nCount = view.getUint32(rgnStart + 8, true);
  if (nCount === 0) {
    return true;
  }
  const rects = [];
  const rectsStart = rgnStart + 32;
  for (let i = 0; i < nCount; i++) {
    const rOff = rectsStart + i * 16;
    if (rOff + 16 > dataOff + 8 + cbRgnData) {
      break;
    }
    const left = view.getInt32(rOff, true);
    const top = view.getInt32(rOff + 4, true);
    const right = view.getInt32(rOff + 8, true);
    const bottom = view.getInt32(rOff + 12, true);
    rects.push({
      x: gmx(rCtx, left),
      y: gmy(rCtx, top),
      w: gmw(rCtx, right - left),
      h: gmh(rCtx, bottom - top)
    });
  }
  if (rects.length === 0) {
    return true;
  }
  gdiCombineClip(rCtx, rectsClipShape(rects), op);
  return true;
}
function handleOffsetClipRgn(rCtx, dataOff, recSize) {
  if (recSize >= 16) {
    const dx = rCtx.view.getInt32(dataOff, true);
    const dy = rCtx.view.getInt32(dataOff + 4, true);
    if (rCtx.clipUntracked) {
      return true;
    }
    if (rCtx.clipRegion) {
      rCtx.clipRegion = translateClipRegion(rCtx.clipRegion, gmw(rCtx, dx), gmh(rCtx, dy));
      reapplyClipRegion(rCtx, rCtx.clipRegion);
    }
  }
  return true;
}
function handleEmfGdiClipRecord(rCtx, recType, dataOff, recSize) {
  switch (recType) {
    case EMR_INTERSECTCLIPRECT:
      return handleIntersectClipRect(rCtx, dataOff, recSize);
    case EMR_EXTSELECTCLIPRGN:
      return handleExtSelectClipRgn(rCtx, dataOff, recSize);
    case EMR_EXCLUDECLIPRECT:
      return handleExcludeClipRect(rCtx, dataOff, recSize);
    case EMR_OFFSETCLIPRGN:
      return handleOffsetClipRgn(rCtx, dataOff, recSize);
    default:
      return false;
  }
}

// src/emf-gdi-draw-text-bitmap.ts
function handleEmfGdiTextBitmapRecord(rCtx, recType, offset, dataOff, recSize) {
  return handleEmfGdiDrawTextRecord(rCtx, recType, offset, dataOff, recSize) || handleEmfGdiBitmapRecord(rCtx, recType, offset, dataOff, recSize) || handleEmfGdiClipRecord(rCtx, recType, dataOff, recSize);
}

// src/emf-gdi-draw-handlers.ts
function handleEmfGdiDrawRecord(rCtx, recType, offset, dataOff, recSize) {
  return handleEmfGdiShapeRecord(rCtx, recType, dataOff, recSize) || handleEmfGdiTextBitmapRecord(rCtx, recType, offset, dataOff, recSize);
}

// src/emf-gdi-polypolygon-helpers.ts
function buildPolyPolygonPath(target, rCtx, readPoint, countsOff, numPolys, totalPoints, close) {
  const { view } = rCtx;
  let pIdx = 0;
  for (let p = 0; p < numPolys; p++) {
    const count = view.getUint32(countsOff + p * 4, true);
    for (let i = 0; i < count && pIdx < totalPoints; i++) {
      const pt = readPoint(pIdx);
      if (i === 0) {
        target.moveTo(pt.x, pt.y);
      } else {
        target.lineTo(pt.x, pt.y);
      }
      pIdx++;
    }
    if (close) {
      target.closePath();
    }
  }
}
function handlePolyPolygon32(rCtx, offset, dataOff, recSize) {
  const { ctx, view, state, inPath } = rCtx;
  const numPolys = view.getUint32(dataOff + 16, true);
  const totalPoints = view.getUint32(dataOff + 20, true);
  if (numPolys === 0 || numPolys >= 1e4 || totalPoints >= 1e5) {
    return;
  }
  const countsOff = dataOff + 24;
  const ptOff = countsOff + numPolys * 4;
  if (ptOff + totalPoints * 8 > offset + recSize) {
    return;
  }
  const readPoint = (pIdx) => gmapPoint(rCtx, view.getInt32(ptOff + pIdx * 8, true), view.getInt32(ptOff + pIdx * 8 + 4, true));
  const build = (target) => {
    buildPolyPolygonPath(target, rCtx, readPoint, countsOff, numPolys, totalPoints, true);
  };
  if (inPath) {
    build(gdiPathRecorder(rCtx));
  } else {
    ctx.beginPath();
    build(ctx);
    const buildWithPath = (target) => {
      target.beginPath();
      build(target);
    };
    fillShapeExactOrFast(rCtx, buildWithPath, state.polyFillMode === 2 ? "nonzero" : "evenodd");
    strokeShapeExactOrFast(rCtx, buildWithPath);
  }
}
function handlePolyPolyline32(rCtx, offset, dataOff, recSize) {
  const { ctx, view, inPath } = rCtx;
  const numPolys = view.getUint32(dataOff + 16, true);
  const totalPoints = view.getUint32(dataOff + 20, true);
  if (numPolys === 0 || numPolys >= 1e4 || totalPoints >= 1e5) {
    return;
  }
  const countsOff = dataOff + 24;
  const ptOff = countsOff + numPolys * 4;
  if (ptOff + totalPoints * 8 > offset + recSize) {
    return;
  }
  const readPoint = (pIdx) => gmapPoint(rCtx, view.getInt32(ptOff + pIdx * 8, true), view.getInt32(ptOff + pIdx * 8 + 4, true));
  const build = (target) => {
    buildPolyPolygonPath(target, rCtx, readPoint, countsOff, numPolys, totalPoints, false);
  };
  if (inPath) {
    build(gdiPathRecorder(rCtx));
  } else {
    ctx.beginPath();
    build(ctx);
    const buildWithPath = (target) => {
      target.beginPath();
      build(target);
    };
    strokeShapeExactOrFast(rCtx, buildWithPath);
  }
}
function handlePolyPolygon16(rCtx, offset, dataOff, recSize) {
  const { ctx, view, state, inPath } = rCtx;
  const numPolys = view.getUint32(dataOff + 16, true);
  const totalPoints = view.getUint32(dataOff + 20, true);
  if (numPolys === 0 || numPolys >= 1e4 || totalPoints >= 1e5) {
    return;
  }
  const countsOff = dataOff + 24;
  const ptOff = countsOff + numPolys * 4;
  if (ptOff + totalPoints * 4 > offset + recSize) {
    return;
  }
  const readPoint = (pIdx) => gmapPoint(rCtx, view.getInt16(ptOff + pIdx * 4, true), view.getInt16(ptOff + pIdx * 4 + 2, true));
  const build = (target) => {
    buildPolyPolygonPath(target, rCtx, readPoint, countsOff, numPolys, totalPoints, true);
  };
  if (inPath) {
    build(gdiPathRecorder(rCtx));
  } else {
    ctx.beginPath();
    build(ctx);
    const buildWithPath = (target) => {
      target.beginPath();
      build(target);
    };
    fillShapeExactOrFast(rCtx, buildWithPath, state.polyFillMode === 2 ? "nonzero" : "evenodd");
    strokeShapeExactOrFast(rCtx, buildWithPath);
  }
}

// src/emf-gdi-poly-path-handlers.ts
function handlePoly32(rCtx, recType, offset, dataOff, recSize) {
  const { ctx, view, state, inPath } = rCtx;
  if (recSize < 28) {
    return true;
  }
  const count = view.getUint32(dataOff + 16, true);
  const ptOff = dataOff + 20;
  if (count === 0 || ptOff + count * 8 > offset + recSize) {
    return true;
  }
  const isPolygon = recType === EMR_POLYGON;
  const isBezier = recType === EMR_POLYBEZIER || recType === EMR_POLYBEZIERTO;
  const isTo = recType === EMR_POLYBEZIERTO || recType === EMR_POLYLINETO;
  const pt = (i) => gmapPoint(rCtx, view.getInt32(ptOff + i * 8, true), view.getInt32(ptOff + i * 8 + 4, true));
  const build = (target) => {
    if (!isTo) {
      const p0 = pt(0);
      target.moveTo(p0.x, p0.y);
    }
    let i = isTo ? 0 : 1;
    if (isBezier) {
      while (i + 2 < count) {
        const p1 = pt(i);
        const p2 = pt(i + 1);
        const p3 = pt(i + 2);
        target.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
        i += 3;
      }
    } else {
      for (; i < count; i++) {
        const p = pt(i);
        target.lineTo(p.x, p.y);
      }
    }
    if (isPolygon) {
      target.closePath();
    }
  };
  if (inPath) {
    build(gdiPathRecorder(rCtx));
  } else {
    ctx.beginPath();
    build(ctx);
    const buildWithPath = (target) => {
      target.beginPath();
      build(target);
    };
    if (isPolygon) {
      fillShapeExactOrFast(rCtx, buildWithPath, state.polyFillMode === 2 ? "nonzero" : "evenodd");
    }
    strokeShapeExactOrFast(rCtx, buildWithPath);
  }
  if (count > 0) {
    const last = count - 1;
    state.curX = view.getInt32(ptOff + last * 8, true);
    state.curY = view.getInt32(ptOff + last * 8 + 4, true);
  }
  return true;
}
function handlePoly16(rCtx, recType, offset, dataOff, recSize) {
  const { ctx, view, state, inPath } = rCtx;
  if (recSize < 28) {
    return true;
  }
  const count = view.getUint32(dataOff + 16, true);
  const ptOff = dataOff + 20;
  if (count === 0 || ptOff + count * 4 > offset + recSize) {
    return true;
  }
  const isPolygon = recType === EMR_POLYGON16;
  const isBezier = recType === EMR_POLYBEZIER16 || recType === EMR_POLYBEZIERTO16;
  const isTo = recType === EMR_POLYBEZIERTO16 || recType === EMR_POLYLINETO16;
  const pt = (i) => gmapPoint(rCtx, view.getInt16(ptOff + i * 4, true), view.getInt16(ptOff + i * 4 + 2, true));
  const build = (target) => {
    if (!isTo) {
      const p0 = pt(0);
      target.moveTo(p0.x, p0.y);
    }
    let i = isTo ? 0 : 1;
    if (isBezier) {
      while (i + 2 < count) {
        const p1 = pt(i);
        const p2 = pt(i + 1);
        const p3 = pt(i + 2);
        target.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
        i += 3;
      }
    } else {
      for (; i < count; i++) {
        const p = pt(i);
        target.lineTo(p.x, p.y);
      }
    }
    if (isPolygon) {
      target.closePath();
    }
  };
  if (inPath) {
    build(gdiPathRecorder(rCtx));
  } else {
    ctx.beginPath();
    build(ctx);
    const buildWithPath = (target) => {
      target.beginPath();
      build(target);
    };
    if (isPolygon) {
      fillShapeExactOrFast(rCtx, buildWithPath, state.polyFillMode === 2 ? "nonzero" : "evenodd");
    }
    strokeShapeExactOrFast(rCtx, buildWithPath);
  }
  if (count > 0) {
    const last = count - 1;
    state.curX = view.getInt16(ptOff + last * 4, true);
    state.curY = view.getInt16(ptOff + last * 4 + 2, true);
  }
  return true;
}
function handleEmfGdiPolyPathRecord(rCtx, recType, offset, dataOff, recSize) {
  const { ctx, state } = rCtx;
  switch (recType) {
    // ---- 32-bit polys ----
    case EMR_POLYLINE:
    case EMR_POLYGON:
    case EMR_POLYBEZIER:
    case EMR_POLYBEZIERTO:
    case EMR_POLYLINETO:
      return handlePoly32(rCtx, recType, offset, dataOff, recSize);
    // ---- 16-bit polys ----
    case EMR_POLYLINE16:
    case EMR_POLYGON16:
    case EMR_POLYBEZIER16:
    case EMR_POLYBEZIERTO16:
    case EMR_POLYLINETO16:
      return handlePoly16(rCtx, recType, offset, dataOff, recSize);
    // ---- polypolyline / polypolygon ----
    case EMR_POLYPOLYLINE:
      if (recSize >= 28) {
        handlePolyPolyline32(rCtx, offset, dataOff, recSize);
      }
      return true;
    case EMR_POLYPOLYGON:
      if (recSize >= 28) {
        handlePolyPolygon32(rCtx, offset, dataOff, recSize);
      }
      return true;
    case EMR_POLYPOLYGON16:
      if (recSize >= 28) {
        handlePolyPolygon16(rCtx, offset, dataOff, recSize);
      }
      return true;
    // ---- path operations ----
    case EMR_BEGINPATH:
      rCtx.inPath = true;
      rCtx.pathCmds = [];
      ctx.beginPath();
      return true;
    case EMR_ENDPATH:
      rCtx.inPath = false;
      return true;
    case EMR_CLOSEFIGURE:
      ctx.closePath();
      if (rCtx.inPath) {
        rCtx.pathCmds.push({ op: "closePath" });
      }
      return true;
    case EMR_FILLPATH: {
      const buildPath = (target) => {
        target.beginPath();
        replayGdiPathCmds(target, rCtx.pathCmds);
      };
      fillShapeExactOrFast(rCtx, buildPath, state.polyFillMode === 2 ? "nonzero" : "evenodd");
      return true;
    }
    case EMR_STROKEANDFILLPATH: {
      const buildPath = (target) => {
        target.beginPath();
        replayGdiPathCmds(target, rCtx.pathCmds);
      };
      fillShapeExactOrFast(rCtx, buildPath, state.polyFillMode === 2 ? "nonzero" : "evenodd");
      strokeShapeExactOrFast(rCtx, buildPath);
      return true;
    }
    case EMR_STROKEPATH: {
      const buildPath = (target) => {
        target.beginPath();
        replayGdiPathCmds(target, rCtx.pathCmds);
      };
      strokeShapeExactOrFast(rCtx, buildPath);
      return true;
    }
    case EMR_SELECTCLIPPATH: {
      const clipMode = recSize >= 12 ? rCtx.view.getUint32(dataOff, true) : 5;
      try {
        if (clipMode === 5) {
          while (rCtx.clipSaveDepth > 0) {
            ctx.restore();
            rCtx.clipSaveDepth--;
          }
        }
        ctx.save();
        rCtx.clipSaveDepth++;
        ctx.clip(state.polyFillMode === 2 ? "nonzero" : "evenodd");
        rCtx.clipRegion = null;
        rCtx.clipUntracked = true;
      } catch {
      }
      return true;
    }
    default:
      return false;
  }
}

// src/emf-gdi-object-handlers.ts
function handleEmfObjectRecord(rCtx, recType, dataOff, recSize) {
  const { view, state } = rCtx;
  switch (recType) {
    case EMR_CREATEPEN: {
      if (recSize >= 28) {
        const ihPen = view.getUint32(dataOff, true);
        const penStyle = view.getUint32(dataOff + 4, true);
        const widthX = view.getInt32(dataOff + 8, true);
        const color = readColorRef(view, dataOff + 16);
        rCtx.objectTable.set(ihPen, {
          kind: "pen",
          style: penStyle & 255,
          widthX,
          color
        });
      }
      return true;
    }
    case EMR_EXTCREATEPEN: {
      if (recSize >= 52) {
        const ihPen = view.getUint32(dataOff, true);
        const penStyle = view.getUint32(dataOff + 12, true);
        const widthX = view.getInt32(dataOff + 16, true);
        const color = readColorRef(view, dataOff + 24);
        rCtx.objectTable.set(ihPen, {
          kind: "pen",
          style: penStyle & 255,
          widthX,
          color
        });
      }
      return true;
    }
    case EMR_CREATEBRUSHINDIRECT: {
      if (recSize >= 24) {
        const ihBrush = view.getUint32(dataOff, true);
        const brushStyle = view.getUint32(dataOff + 4, true);
        const color = readColorRef(view, dataOff + 8);
        const hatch = view.getUint32(dataOff + 12, true);
        rCtx.objectTable.set(ihBrush, {
          kind: "brush",
          style: brushStyle,
          color,
          ...brushStyle === 2 && hatch <= 5 ? { pattern: { kind: "hatch", hatch } } : {}
        });
      }
      return true;
    }
    case EMR_CREATEMONOBRUSH:
    case EMR_CREATEDIBPATTERNBRUSHPT: {
      if (recSize >= 32) {
        const ihBrush = view.getUint32(dataOff, true);
        const mono = recType === EMR_CREATEMONOBRUSH;
        const pattern = parsePatternBrush(view, dataOff - 8, dataOff, mono);
        rCtx.objectTable.set(ihBrush, {
          kind: "brush",
          style: pattern ? mono ? 3 : 6 : 0,
          // Flat stand-in for fills that do not realise the pattern.
          color: "#808080",
          ...pattern ? { pattern } : {}
        });
      }
      return true;
    }
    case EMR_EXTCREATEFONTINDIRECTW: {
      if (recSize >= 332) {
        const ihFont = view.getUint32(dataOff, true);
        const height = view.getInt32(dataOff + 4, true);
        const escapementTenthDeg = view.getInt32(dataOff + 12, true);
        const weight = view.getInt32(dataOff + 20, true);
        const italic = view.getUint8(dataOff + 24);
        const underline = view.getUint8(dataOff + 25);
        const strikeOut = view.getUint8(dataOff + 26);
        const family = readUtf16LE(view, dataOff + 32, 32) || "sans-serif";
        rCtx.objectTable.set(ihFont, {
          kind: "font",
          // Sign kept (not Math.abs'd): resolveFontPixelHeight() needs it
          // to distinguish GDI's cell-height vs character-height convention.
          height,
          weight,
          italic: italic !== 0,
          underline: underline !== 0,
          strikeOut: strikeOut !== 0,
          family,
          escapementTenthDeg
        });
      }
      return true;
    }
    case EMR_SELECTOBJECT: {
      if (recSize >= 12) {
        const ihObject = view.getUint32(dataOff, true);
        const obj = ihObject >= STOCK_OBJECT_BASE ? getStockObject(ihObject - STOCK_OBJECT_BASE) : rCtx.objectTable.get(ihObject) ?? null;
        if (obj) {
          switch (obj.kind) {
            case "pen":
              state.penStyle = obj.style;
              state.penWidth = obj.widthX;
              state.penColor = obj.color;
              break;
            case "brush":
              state.brushStyle = obj.style;
              state.brushColor = obj.color;
              state.brushPattern = obj.pattern ?? null;
              break;
            case "font":
              state.fontHeight = obj.height;
              state.fontWeight = obj.weight;
              state.fontItalic = obj.italic;
              state.fontUnderline = obj.underline;
              state.fontStrikeOut = obj.strikeOut;
              state.fontFamily = obj.family;
              state.fontEscapementTenthDeg = obj.escapementTenthDeg ?? 0;
              break;
          }
        }
      }
      return true;
    }
    case EMR_DELETEOBJECT: {
      if (recSize >= 12) {
        rCtx.objectTable.delete(view.getUint32(dataOff, true));
      }
      return true;
    }
    default:
      return false;
  }
}

// src/emf-gdi-transform-handlers.ts
function handleCoordinateRecord(rCtx, recType, dataOff, recSize) {
  const { view } = rCtx;
  switch (recType) {
    case EMR_SETWINDOWEXTEX: {
      if (recSize >= 16) {
        rCtx.windowExt.cx = view.getInt32(dataOff, true);
        rCtx.windowExt.cy = view.getInt32(dataOff + 4, true);
        activateGdiMappingMode(rCtx);
      }
      return true;
    }
    case EMR_SETWINDOWORGEX: {
      if (recSize >= 16) {
        rCtx.windowOrg.x = view.getInt32(dataOff, true);
        rCtx.windowOrg.y = view.getInt32(dataOff + 4, true);
        activateGdiMappingMode(rCtx);
      }
      return true;
    }
    case EMR_SETVIEWPORTEXTEX: {
      if (recSize >= 16) {
        rCtx.viewportExt.cx = view.getInt32(dataOff, true);
        rCtx.viewportExt.cy = view.getInt32(dataOff + 4, true);
        activateGdiMappingMode(rCtx);
      }
      return true;
    }
    case EMR_SETVIEWPORTORGEX: {
      if (recSize >= 16) {
        rCtx.viewportOrg.x = view.getInt32(dataOff, true);
        rCtx.viewportOrg.y = view.getInt32(dataOff + 4, true);
        activateGdiMappingMode(rCtx);
      }
      return true;
    }
    case EMR_SETMAPMODE: {
      if (recSize >= 12) {
        const mode = view.getUint32(dataOff, true);
        if (mode === 8 || mode === 7) {
          activateGdiMappingMode(rCtx);
        }
      }
      return true;
    }
    case EMR_SCALEVIEWPORTEXTEX: {
      if (recSize >= 24) {
        const xNum = view.getInt32(dataOff, true);
        const xDenom = view.getInt32(dataOff + 4, true);
        const yNum = view.getInt32(dataOff + 8, true);
        const yDenom = view.getInt32(dataOff + 12, true);
        if (xDenom !== 0) {
          rCtx.viewportExt.cx = Math.round(rCtx.viewportExt.cx * xNum / xDenom);
        }
        if (yDenom !== 0) {
          rCtx.viewportExt.cy = Math.round(rCtx.viewportExt.cy * yNum / yDenom);
        }
        activateGdiMappingMode(rCtx);
      }
      return true;
    }
    case EMR_SCALEWINDOWEXTEX: {
      if (recSize >= 24) {
        const xNum = view.getInt32(dataOff, true);
        const xDenom = view.getInt32(dataOff + 4, true);
        const yNum = view.getInt32(dataOff + 8, true);
        const yDenom = view.getInt32(dataOff + 12, true);
        if (xDenom !== 0) {
          rCtx.windowExt.cx = Math.round(rCtx.windowExt.cx * xNum / xDenom);
        }
        if (yDenom !== 0) {
          rCtx.windowExt.cy = Math.round(rCtx.windowExt.cy * yNum / yDenom);
        }
        activateGdiMappingMode(rCtx);
      }
      return true;
    }
    default:
      return false;
  }
}
function handleWorldTransformRecord(rCtx, recType, dataOff, recSize) {
  const { view, state } = rCtx;
  switch (recType) {
    case EMR_SETWORLDTRANSFORM: {
      if (recSize >= 32) {
        state.worldTransform = [
          view.getFloat32(dataOff, true),
          view.getFloat32(dataOff + 4, true),
          view.getFloat32(dataOff + 8, true),
          view.getFloat32(dataOff + 12, true),
          view.getFloat32(dataOff + 16, true),
          view.getFloat32(dataOff + 20, true)
        ];
      }
      return true;
    }
    case EMR_MODIFYWORLDTRANSFORM: {
      if (recSize >= 36) {
        const mode = view.getUint32(dataOff + 24, true);
        if (mode === 1) {
          state.worldTransform = [1, 0, 0, 1, 0, 0];
        } else if (mode === 2 || mode === 3) {
          const xf = [
            view.getFloat32(dataOff, true),
            view.getFloat32(dataOff + 4, true),
            view.getFloat32(dataOff + 8, true),
            view.getFloat32(dataOff + 12, true),
            view.getFloat32(dataOff + 16, true),
            view.getFloat32(dataOff + 20, true)
          ];
          const [a1, b1, c1, d1, e1, f1] = state.worldTransform;
          if (mode === 2) {
            state.worldTransform = [
              xf[0] * a1 + xf[1] * c1,
              xf[0] * b1 + xf[1] * d1,
              xf[2] * a1 + xf[3] * c1,
              xf[2] * b1 + xf[3] * d1,
              xf[4] * a1 + xf[5] * c1 + e1,
              xf[4] * b1 + xf[5] * d1 + f1
            ];
          } else {
            state.worldTransform = [
              a1 * xf[0] + b1 * xf[2],
              a1 * xf[1] + b1 * xf[3],
              c1 * xf[0] + d1 * xf[2],
              c1 * xf[1] + d1 * xf[3],
              e1 * xf[0] + f1 * xf[2] + xf[4],
              e1 * xf[1] + f1 * xf[3] + xf[5]
            ];
          }
        }
      }
      return true;
    }
    default:
      return false;
  }
}
function handleEmfTransformRecord(rCtx, recType, dataOff, recSize) {
  return handleCoordinateRecord(rCtx, recType, dataOff, recSize) || handleWorldTransformRecord(rCtx, recType, dataOff, recSize);
}

// src/emf-types.ts
function defaultState() {
  return {
    penColor: "#000000",
    penWidth: 1,
    penStyle: 0,
    brushColor: "#ffffff",
    brushStyle: 0,
    brushPattern: null,
    brushOrgX: 0,
    brushOrgY: 0,
    stretchBltMode: 1,
    textColor: "#000000",
    bkColor: "#ffffff",
    bkMode: 1,
    // Negative (character-height convention) so the no-font-selected default
    // resolves to exactly 12px, matching this library's historical fallback.
    fontHeight: -12,
    fontWeight: 400,
    fontItalic: false,
    fontFamily: "sans-serif",
    fontUnderline: false,
    fontStrikeOut: false,
    fontEscapementTenthDeg: 0,
    rop2: 13,
    curX: 0,
    curY: 0,
    polyFillMode: 1,
    textAlign: 0,
    worldTransform: [1, 0, 0, 1, 0, 0]
  };
}
function cloneState(s) {
  return {
    ...s,
    worldTransform: [...s.worldTransform]
  };
}
function createEmfPlusState() {
  return {
    objectTable: /* @__PURE__ */ new Map(),
    worldTransform: [1, 0, 0, 1, 0, 0],
    saveStack: [],
    saveIdMap: /* @__PURE__ */ new Map(),
    clipRegion: null,
    clipSaveDepth: 0
  };
}

// src/emf-gdi-state-handlers.ts
function handleEmfGdiStateRecord(rCtx, recType, _offset, dataOff, recSize) {
  if (handleEmfTransformRecord(rCtx, recType, dataOff, recSize)) {
    return true;
  }
  if (handleEmfObjectRecord(rCtx, recType, dataOff, recSize)) {
    return true;
  }
  const { ctx, view, state } = rCtx;
  switch (recType) {
    // ---- save / restore ----
    case EMR_SAVEDC: {
      while (rCtx.clipSaveDepth > 0) {
        ctx.restore();
        rCtx.clipSaveDepth--;
      }
      rCtx.clipStack ?? (rCtx.clipStack = []);
      rCtx.clipStack.push({
        region: rCtx.clipRegion ?? null,
        untracked: rCtx.clipUntracked ?? false
      });
      rCtx.stateStack.push(cloneState(state));
      ctx.save();
      if (rCtx.clipUntracked) {
        rCtx.clipUntracked = false;
        rCtx.clipRegion = null;
      } else if (rCtx.clipRegion) {
        reapplyClipRegion(rCtx, rCtx.clipRegion);
      }
      return true;
    }
    case EMR_RESTOREDC: {
      if (recSize >= 12) {
        while (rCtx.clipSaveDepth > 0) {
          ctx.restore();
          rCtx.clipSaveDepth--;
        }
        let rel = view.getInt32(dataOff, true);
        if (rel < 0) {
          rel = rCtx.stateStack.length + rel + 1;
        }
        while (rCtx.stateStack.length > rel && rCtx.stateStack.length > 0) {
          rCtx.stateStack.pop();
          rCtx.clipStack?.pop();
          ctx.restore();
        }
        const restored = rCtx.stateStack.pop();
        if (restored) {
          const clipSnapshot = rCtx.clipStack?.pop();
          Object.assign(state, restored);
          ctx.restore();
          rCtx.clipRegion = clipSnapshot?.region ?? null;
          rCtx.clipUntracked = false;
          if (rCtx.clipRegion) {
            reapplyClipRegion(rCtx, rCtx.clipRegion);
          }
        }
      }
      return true;
    }
    // ---- drawing mode / color settings ----
    case EMR_SETTEXTCOLOR: {
      if (recSize >= 12) {
        state.textColor = readColorRef(view, dataOff);
      }
      return true;
    }
    case EMR_SETBKCOLOR: {
      if (recSize >= 12) {
        state.bkColor = readColorRef(view, dataOff);
      }
      return true;
    }
    case EMR_SETBKMODE: {
      if (recSize >= 12) {
        state.bkMode = view.getUint32(dataOff, true);
      }
      return true;
    }
    case EMR_SETPOLYFILLMODE: {
      if (recSize >= 12) {
        state.polyFillMode = view.getUint32(dataOff, true);
      }
      return true;
    }
    case EMR_SETROP2: {
      if (recSize >= 12) {
        state.rop2 = view.getUint32(dataOff, true);
      }
      return true;
    }
    case EMR_SETSTRETCHBLTMODE: {
      if (recSize >= 12) {
        state.stretchBltMode = view.getUint32(dataOff, true);
      }
      return true;
    }
    case EMR_SETBRUSHORGEX: {
      if (recSize >= 16) {
        state.brushOrgX = view.getInt32(dataOff, true);
        state.brushOrgY = view.getInt32(dataOff + 4, true);
      }
      return true;
    }
    case EMR_SETMITERLIMIT:
    case EMR_SETTEXTALIGN: {
      if (recType === EMR_SETTEXTALIGN && recSize >= 12) {
        state.textAlign = view.getUint32(dataOff, true);
      }
      return true;
    }
    default:
      return false;
  }
}

// src/emf-plus-read-helpers.ts
function readRectFromView(view, offset, compressed) {
  if (compressed) {
    return {
      x: view.getInt16(offset, true),
      y: view.getInt16(offset + 2, true),
      w: view.getInt16(offset + 4, true),
      h: view.getInt16(offset + 6, true)
    };
  }
  return {
    x: view.getFloat32(offset, true),
    y: view.getFloat32(offset + 4, true),
    w: view.getFloat32(offset + 8, true),
    h: view.getFloat32(offset + 12, true)
  };
}
function readPointFromView(view, offset, compressed) {
  if (compressed) {
    return {
      x: view.getInt16(offset, true),
      y: view.getInt16(offset + 2, true)
    };
  }
  return {
    x: view.getFloat32(offset, true),
    y: view.getFloat32(offset + 4, true)
  };
}

// src/emf-plus-brush-gradient.ts
var IDENTITY = [1, 0, 0, 1, 0, 0];
function mulMatrix(a, b) {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5]
  ];
}
function invertLinear(m) {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) {
    return null;
  }
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det];
}
function lerpArgb2(a, b, t) {
  const ch = (shift) => {
    const ca = a >>> shift & 255;
    const cb = b >>> shift & 255;
    return Math.round(ca + (cb - ca) * t);
  };
  return (ch(24) << 24 | ch(16) << 16 | ch(8) << 8 | ch(0)) >>> 0;
}
function piecewise(xs, ys, x) {
  const n = Math.min(xs.length, ys.length);
  if (n === 0) {
    return x;
  }
  if (x <= xs[0]) {
    return ys[0];
  }
  for (let i = 1; i < n; i++) {
    if (x <= xs[i]) {
      const span = xs[i] - xs[i - 1];
      const f = span > 0 ? (x - xs[i - 1]) / span : 1;
      return ys[i - 1] + (ys[i] - ys[i - 1]) * f;
    }
  }
  return ys[n - 1];
}
function stopColorAt(stops, t) {
  if (stops.length === 0 || stops.some((s) => s.argb === void 0)) {
    return null;
  }
  if (t <= stops[0].offset) {
    return stops[0].argb;
  }
  for (let i = 1; i < stops.length; i++) {
    const b = stops[i];
    if (t <= b.offset) {
      const a = stops[i - 1];
      const span = b.offset - a.offset;
      return lerpArgb2(a.argb, b.argb, span > 0 ? (t - a.offset) / span : 1);
    }
  }
  return stops[stops.length - 1].argb;
}
function pathGradientColorAt(shape, x, y) {
  const { center, boundary, boundaryArgb } = shape;
  const n = boundary.length;
  const px = x - center.x;
  const py = y - center.y;
  let found = -1;
  let bestS = 0;
  let bestU = 0;
  const eps = 1e-9;
  for (let i = 0; i < n; i++) {
    const v0 = boundary[i];
    const v1 = boundary[(i + 1) % n];
    const ax = v0.x - center.x;
    const ay = v0.y - center.y;
    const ex = v1.x - v0.x;
    const ey = v1.y - v0.y;
    const det = ax * ey - ay * ex;
    if (Math.abs(det) < 1e-12) {
      continue;
    }
    const alpha = (px * ey - py * ex) / det;
    const beta = (ax * py - ay * px) / det;
    if (alpha < -eps || beta < -eps || beta > alpha + eps || alpha > 1 + eps) {
      continue;
    }
    found = i;
    bestS = Math.max(0, alpha);
    bestU = alpha > 0 ? Math.min(1, Math.max(0, beta / alpha)) : 0;
  }
  if (found < 0) {
    return null;
  }
  let s = bestS;
  if (shape.focus) {
    const f = Math.min(0.999, Math.max(0, (shape.focus.x + shape.focus.y) / 2));
    s = s <= f ? 0 : (s - f) / (1 - f);
  }
  const pos = 1 - s;
  if (shape.preset && shape.preset.positions.length > 0) {
    const { positions, argb } = shape.preset;
    if (pos <= positions[0]) {
      return argb[0];
    }
    for (let k = 1; k < positions.length; k++) {
      if (pos <= positions[k]) {
        const span = positions[k] - positions[k - 1];
        return lerpArgb2(argb[k - 1], argb[k], span > 0 ? (pos - positions[k - 1]) / span : 1);
      }
    }
    return argb[positions.length - 1];
  }
  const c0 = boundaryArgb[found] ?? shape.centerArgb;
  const c1 = boundaryArgb[(found + 1) % n] ?? c0;
  const surround = lerpArgb2(c0, c1, bestU);
  const factor = shape.blend ? piecewise(shape.blend.positions, shape.blend.factors, pos) : pos;
  return lerpArgb2(surround, shape.centerArgb, Math.min(1, Math.max(0, factor)));
}
var MAX_TILE = 2048;
function mirrorFlags(wrap) {
  return {
    x: wrap === "tile-flip-x" || wrap === "tile-flip-xy",
    y: wrap === "tile-flip-y" || wrap === "tile-flip-xy"
  };
}
function buildPattern(ctx, rect, tw, th, wrap, brush, delta, sampling, colorAt) {
  if (typeof ctx.createPattern !== "function") {
    return null;
  }
  const mirror = wrap === "clamp" ? { x: false, y: false } : mirrorFlags(wrap);
  const w = tw * (mirror.x ? 2 : 1);
  const h = th * (mirror.y ? 2 : 1);
  const temp = createTempCanvas(w, h);
  if (!temp) {
    return null;
  }
  const stepX = rect.w / tw;
  const stepY = rect.h / th;
  const offX = (i) => {
    const d = i % tw * stepX + (0.5 + sampling.phaseX) * stepX;
    return i < tw ? d : rect.w - sampling.lagX - (d - (0.5 + sampling.phaseX) * stepX) - 0.5 * stepX;
  };
  const offY = (j) => {
    const d = (j % th + 0.5) * stepY;
    return j < th ? d : rect.h - sampling.lagY - d;
  };
  const data = new Uint8ClampedArray(w * h * 4);
  for (let j = 0; j < h; j++) {
    const by = rect.y + offY(j);
    for (let i = 0; i < w; i++) {
      const c = colorAt(rect.x + offX(i), by);
      if (c === null) {
        continue;
      }
      const o = (j * w + i) * 4;
      data[o] = c >>> 16 & 255;
      data[o + 1] = c >>> 8 & 255;
      data[o + 2] = c & 255;
      data[o + 3] = c >>> 24 & 255;
    }
  }
  canvasPutImageData(temp.ctx, createImageDataCompat(data, w, h), 0, 0);
  const pattern = canvasCreatePattern(ctx, temp.canvas, wrap === "clamp" ? "no-repeat" : "repeat");
  if (!pattern || typeof pattern.setTransform !== "function") {
    return null;
  }
  const place = [stepX, 0, 0, stepY, rect.x + sampling.phaseX * stepX, rect.y];
  const m = mulMatrix([1, 0, 0, 1, delta.x, delta.y], mulMatrix(brush, place));
  try {
    pattern.setTransform({ a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5] });
  } catch {
    return null;
  }
  return pattern;
}
function halfPixelDelta(device) {
  const inv = invertLinear(device);
  if (!inv) {
    return { x: 0, y: 0 };
  }
  return { x: inv[0] * 0.5 + inv[2] * 0.5, y: inv[1] * 0.5 + inv[3] * 0.5 };
}
var SUPERSAMPLE = 4;
function texelsFor(full, axis, length) {
  const scale = axis === "x" ? Math.hypot(full[0], full[1]) : Math.hypot(full[2], full[3]);
  return Math.max(2, Math.min(MAX_TILE, Math.ceil(Math.abs(length) * scale * SUPERSAMPLE)));
}
function linearGradientEndpoints(rect, transform) {
  const m = transform ?? IDENTITY;
  const map = (x, y) => ({
    x: m[0] * x + m[2] * y + m[4],
    y: m[1] * x + m[3] * y + m[5]
  });
  const p1 = map(rect.x, rect.y + rect.h / 2);
  const pe = map(rect.x + rect.w, rect.y + rect.h / 2);
  const nx = m[3];
  const ny = -m[2];
  const nn = nx * nx + ny * ny;
  if (nn < 1e-12) {
    return { x1: p1.x, y1: p1.y, x2: pe.x, y2: pe.y };
  }
  const t = ((pe.x - p1.x) * nx + (pe.y - p1.y) * ny) / nn;
  return { x1: p1.x, y1: p1.y, x2: p1.x + nx * t, y2: p1.y + ny * t };
}
function plainLinear(ctx, grad) {
  if (typeof ctx.createLinearGradient !== "function") {
    return null;
  }
  const pts = grad.rect ? linearGradientEndpoints(grad.rect, grad.transform) : grad;
  if (pts.x1 === pts.x2 && pts.y1 === pts.y2) {
    return null;
  }
  const g = ctx.createLinearGradient(pts.x1, pts.y1, pts.x2, pts.y2);
  for (const stop of grad.stops) {
    g.addColorStop(stop.offset, stop.color);
  }
  return g;
}
var SEAM_BIAS = 1e-5;
var MAX_PERIODS = 2048;
function surfaceSize3(ctx) {
  const canvas = ctx.canvas;
  const w = canvas?.width;
  const h = canvas?.height;
  return typeof w === "number" && typeof h === "number" && w > 0 && h > 0 ? { w, h } : null;
}
function tiledLinear(ctx, grad, rect, device) {
  const size = surfaceSize3(ctx);
  const inv = invertLinear(device);
  if (!size || !inv || typeof ctx.createLinearGradient !== "function") {
    return null;
  }
  const e = linearGradientEndpoints(rect, grad.transform);
  const delta = halfPixelDelta(device);
  const dx = e.x2 - e.x1;
  const dy = e.y2 - e.y1;
  const x1 = e.x1 + delta.x + dx * SEAM_BIAS;
  const y1 = e.y1 + delta.y + dy * SEAM_BIAS;
  const len2 = dx * dx + dy * dy;
  if (!(len2 > 1e-12)) {
    return null;
  }
  let tMin = Infinity;
  let tMax = -Infinity;
  for (const [cx, cy] of [
    [0, 0],
    [size.w, 0],
    [0, size.h],
    [size.w, size.h]
  ]) {
    const px = cx - device[4];
    const py = cy - device[5];
    const wx = inv[0] * px + inv[2] * py;
    const wy = inv[1] * px + inv[3] * py;
    const t = ((wx - x1) * dx + (wy - y1) * dy) / len2;
    tMin = Math.min(tMin, t);
    tMax = Math.max(tMax, t);
  }
  const k0 = Math.floor(tMin);
  const k1 = Math.max(k0 + 1, Math.ceil(tMax));
  if (k1 - k0 > MAX_PERIODS) {
    return null;
  }
  const g = ctx.createLinearGradient(x1 + dx * k0, y1 + dy * k0, x1 + dx * k1, y1 + dy * k1);
  const span = k1 - k0;
  const mirrorX = mirrorFlags(grad.wrapMode).x;
  const reversed = [...grad.stops].reverse();
  for (let k = k0; k < k1; k++) {
    const mirrored = mirrorX && (k % 2 + 2) % 2 === 1;
    for (const stop of mirrored ? reversed : grad.stops) {
      const local = mirrored ? 1 - stop.offset : stop.offset;
      g.addColorStop(Math.min(1, Math.max(0, (k - k0 + local) / span)), stop.color);
    }
  }
  return g;
}
function linearPaint(ctx, grad, device) {
  const rect = grad.rect;
  if (grad.wrapMode !== "clamp" && rect && rect.w !== 0) {
    const unrolled = tiledLinear(ctx, grad, rect, device);
    if (unrolled) {
      return unrolled;
    }
    if (stopColorAt(grad.stops, 0) !== null) {
      const brush = grad.transform ?? IDENTITY;
      const tw = texelsFor(mulMatrix(device, brush), "x", rect.w);
      const pattern = buildPattern(
        ctx,
        rect,
        tw,
        1,
        grad.wrapMode,
        brush,
        halfPixelDelta(device),
        { phaseX: 0.5, lagX: 0, lagY: 0 },
        (bx) => stopColorAt(grad.stops, (bx - rect.x) / rect.w)
      );
      if (pattern) {
        return pattern;
      }
    }
  }
  return plainLinear(ctx, grad);
}
function boundaryBox(points) {
  if (points.length < 3) {
    return null;
  }
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}
function pathPaint(ctx, shape, wrap, device) {
  const box = boundaryBox(shape.boundary);
  if (!box) {
    return null;
  }
  const brush = shape.transform ?? IDENTITY;
  const full = mulMatrix(device, brush);
  const pxX = Math.hypot(full[0], full[1]);
  const pxY = Math.hypot(full[2], full[3]);
  return buildPattern(
    ctx,
    box,
    texelsFor(full, "x", box.w),
    texelsFor(full, "y", box.h),
    wrap,
    brush,
    halfPixelDelta(device),
    { phaseX: 0, lagX: pxX > 0 ? 1 / pxX : 0, lagY: pxY > 0 ? 1 / pxY : 0 },
    (bx, by) => pathGradientColorAt(shape, bx, by)
  );
}
function radialFallback(ctx, grad) {
  if (!(grad.r > 0) || typeof ctx.createRadialGradient !== "function") {
    return null;
  }
  const g = ctx.createRadialGradient(grad.cx, grad.cy, 0, grad.cx, grad.cy, grad.r);
  for (const stop of grad.stops) {
    g.addColorStop(stop.offset, stop.color);
  }
  return g;
}
function createBrushGradient(ctx, grad, device = IDENTITY) {
  try {
    if (grad.type === "linear") {
      return linearPaint(ctx, grad, device);
    }
    if (grad.shape) {
      const pattern = pathPaint(ctx, grad.shape, grad.wrapMode, device);
      if (pattern) {
        return pattern;
      }
      emfLog("createBrushGradient: path gradient pattern unavailable, using the radial approximation");
    }
    return radialFallback(ctx, grad);
  } catch {
    return null;
  }
}

// src/emf-plus-brush-texture.ts
var IDENTITY2 = [1, 0, 0, 1, 0, 0];
function packArgb(rgba, i) {
  return (rgba[i + 3] << 24 | rgba[i] << 16 | rgba[i + 1] << 8 | rgba[i + 2]) >>> 0;
}
function createBrushTexture(ctx, texture, device = IDENTITY2) {
  const { width, height, rgba } = texture;
  if (width <= 0 || height <= 0) {
    return null;
  }
  try {
    const brush = texture.transform ?? IDENTITY2;
    const colorAt = (bx, by) => {
      const ix = Math.floor(bx);
      const iy = Math.floor(by);
      if (ix < 0 || iy < 0 || ix >= width || iy >= height) {
        return null;
      }
      return packArgb(rgba, (iy * width + ix) * 4);
    };
    return buildPattern(
      ctx,
      { x: 0, y: 0, w: width, h: height },
      width,
      height,
      texture.wrapMode,
      brush,
      halfPixelDelta(device),
      { phaseX: 0, lagX: 0, lagY: 0 },
      colorAt
    );
  } catch {
    return null;
  }
}

// src/emf-plus-state-handlers.ts
function multiplyMatrix(m1, m2) {
  return [
    m1[0] * m2[0] + m1[1] * m2[2],
    m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2],
    m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
    m1[4] * m2[1] + m1[5] * m2[3] + m2[5]
  ];
}
function resolveBrushPaint(rCtx, flags, brushIdOrColor) {
  if (flags & 32768) {
    return argbToRgba(brushIdOrColor);
  }
  const obj = rCtx.objectTable.get(brushIdOrColor & 255);
  if (obj && obj.kind === "plus-brush") {
    if (obj.gradient) {
      const g = createBrushGradient(rCtx.ctx, obj.gradient, plusWorldMatrix(rCtx));
      if (g) {
        return g;
      }
    }
    if (obj.texture) {
      const p = createBrushTexture(rCtx.ctx, obj.texture, plusWorldMatrix(rCtx));
      if (p) {
        return p;
      }
    }
    return obj.color;
  }
  return "rgba(0,0,0,1)";
}
function getPageUnitMultiplier(pageUnit, pageScale) {
  const DPI = 96;
  let unitToPixel;
  switch (pageUnit) {
    case 3:
      unitToPixel = DPI / 72;
      break;
    // Point
    case 4:
      unitToPixel = DPI;
      break;
    // Inch
    case 5:
      unitToPixel = DPI / 300;
      break;
    // Document
    case 6:
      unitToPixel = DPI / 25.4;
      break;
    // Millimeter
    default:
      unitToPixel = 1;
      break;
  }
  return unitToPixel * pageScale;
}
function plusWorldMatrix(rCtx) {
  const wt = rCtx.worldTransform;
  const k = getPageUnitMultiplier(rCtx.pageUnit, rCtx.pageScale) * rCtx.dpiScale;
  return [wt[0] * k, wt[1] * k, wt[2] * k, wt[3] * k, wt[4] * k, wt[5] * k];
}
function applyPlusWorldTransform(rCtx) {
  const m = plusWorldMatrix(rCtx);
  rCtx.ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
}
function pushState(rCtx, stackId) {
  rCtx.saveStack.push({
    transform: [...rCtx.worldTransform]
  });
  rCtx.saveIdMap.set(stackId, rCtx.saveStack.length - 1);
}
function popState(rCtx, stackId) {
  const idx = rCtx.saveIdMap.get(stackId);
  if (idx !== void 0 && idx < rCtx.saveStack.length) {
    rCtx.worldTransform = [...rCtx.saveStack[idx].transform];
    rCtx.saveStack.length = idx;
    const newMap = /* @__PURE__ */ new Map();
    for (const [k, v] of rCtx.saveIdMap) {
      if (v < idx) {
        newMap.set(k, v);
      }
    }
    rCtx.saveIdMap = newMap;
  }
}
function plusDeviceMatrix(rCtx) {
  const wt = rCtx.worldTransform;
  const s = getPageUnitMultiplier(rCtx.pageUnit, rCtx.pageScale) * rCtx.dpiScale;
  return [wt[0] * s, wt[1] * s, wt[2] * s, wt[3] * s, wt[4] * s, wt[5] * s];
}
function transformedRectShape(x, y, w, h, m) {
  const tx = (px, py) => m[0] * px + m[2] * py + m[4];
  const ty = (px, py) => m[1] * px + m[3] * py + m[5];
  const cmds = [
    { op: "moveTo", x: tx(x, y), y: ty(x, y) },
    { op: "lineTo", x: tx(x + w, y), y: ty(x + w, y) },
    { op: "lineTo", x: tx(x + w, y + h), y: ty(x + w, y + h) },
    { op: "lineTo", x: tx(x, y + h), y: ty(x, y + h) },
    { op: "closePath" }
  ];
  return { cmds, fillRule: "nonzero", simple: true };
}
function pathClipShape(path, m) {
  return { cmds: emfPlusPathToClipCmds(path.path, m), fillRule: "nonzero", simple: true };
}
var REGION_NODE_OPS = {
  0: "intersect",
  // legacy/lenient: treat 0 as And
  1: "intersect",
  // RegionNodeDataTypeAnd
  2: "union",
  // RegionNodeDataTypeOr
  3: "xor",
  // RegionNodeDataTypeXor
  4: "exclude",
  // RegionNodeDataTypeExclude
  5: "complement"
  // RegionNodeDataTypeComplement
};
var MAX_REGION_FLATTEN_DEPTH = 64;
function flattenRegionNode(node, m, depth = 0) {
  if (depth > MAX_REGION_FLATTEN_DEPTH) {
    return { region: [emptyClipShape()], exact: false };
  }
  switch (node.type) {
    case "rect":
      return { region: [transformedRectShape(node.x, node.y, node.width, node.height, m)], exact: true };
    case "path":
      return { region: [pathClipShape(node, m)], exact: true };
    case "infinite":
      return { region: null, exact: true };
    case "empty":
      return { region: [emptyClipShape()], exact: true };
    case "combine": {
      const left = flattenRegionNode(node.left, m, depth + 1);
      const right = flattenRegionNode(node.right, m, depth + 1);
      const op = REGION_NODE_OPS[node.combineMode] ?? "intersect";
      const combined = combineClipRegions(left.region, right.region, op);
      return { region: combined.region, exact: combined.exact && left.exact && right.exact };
    }
  }
}
var PLUS_COMBINE_OPS = {
  0: "replace",
  1: "intersect",
  2: "union",
  3: "xor",
  4: "exclude",
  5: "complement"
};
function reapplyPlusClip(rCtx) {
  reapplyClipRegion(rCtx, rCtx.clipRegion ?? null, true);
}
function applyPlusClipRegion(rCtx, incoming, combineMode, opName) {
  const op = PLUS_COMBINE_OPS[combineMode];
  const res = combineClipRegions(rCtx.clipRegion ?? null, incoming, op ?? "intersect");
  if (!res.exact) ;
  rCtx.clipRegion = res.region;
  reapplyPlusClip(rCtx);
}
function applyPlusClipShape(rCtx, shape, combineMode, opName) {
  applyPlusClipRegion(rCtx, [shape], combineMode);
}
function handleEmfPlusStateRecord(rCtx, recType, recFlags, dataOff, recDataSize) {
  const { view } = rCtx;
  switch (recType) {
    // ---- transforms ----
    case EMFPLUS_SETWORLDTRANSFORM: {
      if (recDataSize >= 24) {
        rCtx.worldTransform = [
          view.getFloat32(dataOff, true),
          view.getFloat32(dataOff + 4, true),
          view.getFloat32(dataOff + 8, true),
          view.getFloat32(dataOff + 12, true),
          view.getFloat32(dataOff + 16, true),
          view.getFloat32(dataOff + 20, true)
        ];
      }
      return true;
    }
    case EMFPLUS_RESETWORLDTRANSFORM: {
      rCtx.worldTransform = [1, 0, 0, 1, 0, 0];
      return true;
    }
    case EMFPLUS_MULTIPLYWORLDTRANSFORM: {
      if (recDataSize >= 24) {
        const xf = [
          view.getFloat32(dataOff, true),
          view.getFloat32(dataOff + 4, true),
          view.getFloat32(dataOff + 8, true),
          view.getFloat32(dataOff + 12, true),
          view.getFloat32(dataOff + 16, true),
          view.getFloat32(dataOff + 20, true)
        ];
        if (recFlags & 8192) {
          rCtx.worldTransform = multiplyMatrix(rCtx.worldTransform, xf);
        } else {
          rCtx.worldTransform = multiplyMatrix(xf, rCtx.worldTransform);
        }
      }
      return true;
    }
    case EMFPLUS_TRANSLATEWORLDTRANSFORM: {
      if (recDataSize >= 8) {
        const dx = view.getFloat32(dataOff, true);
        const dy = view.getFloat32(dataOff + 4, true);
        const xf = [1, 0, 0, 1, dx, dy];
        if (recFlags & 8192) {
          rCtx.worldTransform = multiplyMatrix(rCtx.worldTransform, xf);
        } else {
          rCtx.worldTransform = multiplyMatrix(xf, rCtx.worldTransform);
        }
      }
      return true;
    }
    case EMFPLUS_SCALEWORLDTRANSFORM: {
      if (recDataSize >= 8) {
        const sx = view.getFloat32(dataOff, true);
        const sy = view.getFloat32(dataOff + 4, true);
        const xf = [sx, 0, 0, sy, 0, 0];
        if (recFlags & 8192) {
          rCtx.worldTransform = multiplyMatrix(rCtx.worldTransform, xf);
        } else {
          rCtx.worldTransform = multiplyMatrix(xf, rCtx.worldTransform);
        }
      }
      return true;
    }
    case EMFPLUS_ROTATEWORLDTRANSFORM: {
      if (recDataSize >= 4) {
        const angle = view.getFloat32(dataOff, true) * Math.PI / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const xf = [cos, sin, -sin, cos, 0, 0];
        if (recFlags & 8192) {
          rCtx.worldTransform = multiplyMatrix(rCtx.worldTransform, xf);
        } else {
          rCtx.worldTransform = multiplyMatrix(xf, rCtx.worldTransform);
        }
      }
      return true;
    }
    // ---- save / restore ----
    case EMFPLUS_SAVE: {
      if (recDataSize >= 4) {
        pushState(rCtx, view.getUint32(dataOff, true));
      }
      return true;
    }
    case EMFPLUS_RESTORE: {
      if (recDataSize >= 4) {
        popState(rCtx, view.getUint32(dataOff, true));
      }
      return true;
    }
    // ---- clipping ----
    case EMFPLUS_SETCLIPRECT: {
      if (recDataSize >= 16) {
        const combineMode = recFlags >> 8 & 15;
        const cx = view.getFloat32(dataOff, true);
        const cy = view.getFloat32(dataOff + 4, true);
        const cw = view.getFloat32(dataOff + 8, true);
        const ch = view.getFloat32(dataOff + 12, true);
        const shape = transformedRectShape(cx, cy, cw, ch, plusDeviceMatrix(rCtx));
        applyPlusClipShape(rCtx, shape, combineMode);
      }
      return true;
    }
    case EMFPLUS_RESETCLIP: {
      rCtx.clipRegion = null;
      reapplyPlusClip(rCtx);
      return true;
    }
    case EMFPLUS_SETCLIPREGION: {
      const regionId = recFlags & 255;
      const combineMode = recFlags >> 8 & 15;
      const regionObj = rCtx.objectTable.get(regionId);
      if (regionObj && regionObj.kind === "plus-region" && regionObj.nodes.length > 0) {
        const flattened = flattenRegionNode(regionObj.nodes[0], plusDeviceMatrix(rCtx));
        if (!flattened.exact) ;
        applyPlusClipRegion(rCtx, flattened.region, combineMode);
      }
      return true;
    }
    case EMFPLUS_SETCLIPPATH: {
      const pathId = recFlags & 255;
      const combineMode = recFlags >> 8 & 15;
      const pathObj = rCtx.objectTable.get(pathId);
      if (pathObj && pathObj.kind === "plus-path") {
        const shape = {
          cmds: emfPlusPathToClipCmds(pathObj, plusDeviceMatrix(rCtx)),
          fillRule: "nonzero",
          simple: true
        };
        applyPlusClipShape(rCtx, shape, combineMode);
      }
      return true;
    }
    case EMFPLUS_OFFSETCLIP: {
      if (recDataSize >= 8) {
        const dx = view.getFloat32(dataOff, true);
        const dy = view.getFloat32(dataOff + 4, true);
        if (rCtx.clipRegion) {
          const m = plusDeviceMatrix(rCtx);
          const ddx = m[0] * dx + m[2] * dy;
          const ddy = m[1] * dx + m[3] * dy;
          rCtx.clipRegion = translateClipRegion(rCtx.clipRegion, ddx, ddy);
          reapplyPlusClip(rCtx);
        }
      }
      return true;
    }
    // ---- containers ----
    case EMFPLUS_BEGINCONTAINERNOPARAMS: {
      if (recDataSize >= 4) {
        pushState(rCtx, view.getUint32(dataOff, true));
      }
      return true;
    }
    case EMFPLUS_ENDCONTAINER: {
      if (recDataSize >= 4) {
        popState(rCtx, view.getUint32(dataOff, true));
      }
      return true;
    }
    // ---- page transform ----
    case EMFPLUS_SETPAGETRANSFORM: {
      const pageUnit = recFlags & 255;
      const pageScale = recDataSize >= 4 ? view.getFloat32(dataOff, true) : 1;
      rCtx.pageUnit = pageUnit;
      rCtx.pageScale = pageScale;
      return true;
    }
    // ---- rendering hints (accepted, ignored) ----
    case EMFPLUS_SETANTIALIASMODE:
    case EMFPLUS_SETTEXTRENDERINGHINT:
    case EMFPLUS_SETINTERPOLATIONMODE:
    case EMFPLUS_SETPIXELOFFSETMODE:
    case EMFPLUS_SETCOMPOSITINGQUALITY:
      return true;
    default:
      return false;
  }
}

// src/emf-plus-draw-handlers.ts
function applyEmfPlusPen(ctx, pen) {
  ctx.strokeStyle = pen.color;
  ctx.lineWidth = pen.width;
  const w = pen.width || 1;
  switch (pen.dashStyle) {
    case 1:
      ctx.setLineDash([w * 3, Number(w)]);
      break;
    // Dash
    case 2:
      ctx.setLineDash([Number(w), Number(w)]);
      break;
    // Dot
    case 3:
      ctx.setLineDash([w * 3, Number(w), Number(w), Number(w)]);
      break;
    // DashDot
    case 4:
      ctx.setLineDash([w * 3, Number(w), Number(w), Number(w), Number(w), Number(w)]);
      break;
    // DashDotDot
    default:
      ctx.setLineDash([]);
      break;
  }
}
function handleEmfPlusDrawRecord(rCtx, recType, recFlags, dataOff, recDataSize) {
  const { ctx, view, objectTable } = rCtx;
  switch (recType) {
    case EMFPLUS_FILLRECTS: {
      if (recDataSize >= 8) {
        const brushVal = view.getUint32(dataOff, true);
        const count = view.getUint32(dataOff + 4, true);
        const compressed = (recFlags & 16384) !== 0;
        const rectSize = compressed ? 8 : 16;
        ctx.fillStyle = resolveBrushPaint(rCtx, recFlags, brushVal);
        applyPlusWorldTransform(rCtx);
        let rOff = dataOff + 8;
        for (let i = 0; i < count && rOff + rectSize <= dataOff + recDataSize; i++) {
          const { x, y, w, h } = readRectFromView(view, rOff, compressed);
          ctx.fillRect(x, y, w, h);
          rOff += rectSize;
        }
      }
      return true;
    }
    case EMFPLUS_DRAWRECTS: {
      if (recDataSize >= 4) {
        const penId = recFlags & 255;
        const pen = objectTable.get(penId);
        const count = view.getUint32(dataOff, true);
        const compressed = (recFlags & 16384) !== 0;
        const rectSize = compressed ? 8 : 16;
        if (pen && pen.kind === "plus-pen") {
          applyEmfPlusPen(ctx, pen);
        }
        applyPlusWorldTransform(rCtx);
        let rOff = dataOff + 4;
        for (let i = 0; i < count && rOff + rectSize <= dataOff + recDataSize; i++) {
          const { x, y, w, h } = readRectFromView(view, rOff, compressed);
          ctx.strokeRect(x, y, w, h);
          rOff += rectSize;
        }
      }
      return true;
    }
    case EMFPLUS_FILLELLIPSE: {
      if (recDataSize >= 12) {
        const brushVal = view.getUint32(dataOff, true);
        const compressed = (recFlags & 16384) !== 0;
        let x, y, w, h;
        if (compressed) {
          x = view.getInt16(dataOff + 4, true);
          y = view.getInt16(dataOff + 6, true);
          w = view.getInt16(dataOff + 8, true);
          h = view.getInt16(dataOff + 10, true);
        } else {
          if (recDataSize < 20) {
            return true;
          }
          x = view.getFloat32(dataOff + 4, true);
          y = view.getFloat32(dataOff + 8, true);
          w = view.getFloat32(dataOff + 12, true);
          h = view.getFloat32(dataOff + 16, true);
        }
        ctx.fillStyle = resolveBrushPaint(rCtx, recFlags, brushVal);
        applyPlusWorldTransform(rCtx);
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w) / 2, Math.abs(h) / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      return true;
    }
    case EMFPLUS_DRAWELLIPSE: {
      const penId = recFlags & 255;
      const pen = objectTable.get(penId);
      const compressed = (recFlags & 16384) !== 0;
      let x, y, w, h;
      if (compressed && recDataSize >= 8) {
        x = view.getInt16(dataOff, true);
        y = view.getInt16(dataOff + 2, true);
        w = view.getInt16(dataOff + 4, true);
        h = view.getInt16(dataOff + 6, true);
      } else if (!compressed && recDataSize >= 16) {
        x = view.getFloat32(dataOff, true);
        y = view.getFloat32(dataOff + 4, true);
        w = view.getFloat32(dataOff + 8, true);
        h = view.getFloat32(dataOff + 12, true);
      } else {
        return true;
      }
      if (pen && pen.kind === "plus-pen") {
        applyEmfPlusPen(ctx, pen);
      }
      applyPlusWorldTransform(rCtx);
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w) / 2, Math.abs(h) / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      return true;
    }
    case EMFPLUS_FILLPIE:
    case EMFPLUS_DRAWPIE:
    case EMFPLUS_DRAWARC: {
      const isFill = recType === EMFPLUS_FILLPIE;
      const minSize = isFill ? 12 : 8;
      if (recDataSize < minSize) {
        return true;
      }
      let aOff = dataOff;
      if (isFill) {
        const brushVal = view.getUint32(aOff, true);
        ctx.fillStyle = resolveBrushPaint(rCtx, recFlags, brushVal);
        aOff += 4;
      }
      const startAngle = view.getFloat32(aOff, true) * Math.PI / 180;
      const sweepAngle = view.getFloat32(aOff + 4, true) * Math.PI / 180;
      aOff += 8;
      const compressed = (recFlags & 16384) !== 0;
      let x, y, w, h;
      if (compressed && aOff + 8 <= dataOff + recDataSize) {
        x = view.getInt16(aOff, true);
        y = view.getInt16(aOff + 2, true);
        w = view.getInt16(aOff + 4, true);
        h = view.getInt16(aOff + 6, true);
      } else if (!compressed && aOff + 16 <= dataOff + recDataSize) {
        x = view.getFloat32(aOff, true);
        y = view.getFloat32(aOff + 4, true);
        w = view.getFloat32(aOff + 8, true);
        h = view.getFloat32(aOff + 12, true);
      } else {
        return true;
      }
      if (recType !== EMFPLUS_FILLPIE) {
        const penId = recFlags & 255;
        const pen = objectTable.get(penId);
        if (pen && pen.kind === "plus-pen") {
          applyEmfPlusPen(ctx, pen);
        }
      }
      applyPlusWorldTransform(rCtx);
      ctx.beginPath();
      const cx = x + w / 2;
      const cy = y + h / 2;
      const rx = Math.abs(w) / 2;
      const ry = Math.abs(h) / 2;
      if (isFill) {
        ctx.moveTo(cx, cy);
      }
      ctx.ellipse(cx, cy, rx, ry, 0, startAngle, startAngle + sweepAngle, sweepAngle < 0);
      if (isFill) {
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.stroke();
      }
      return true;
    }
    case EMFPLUS_DRAWLINES: {
      if (recDataSize >= 4) {
        const penId = recFlags & 255;
        const pen = objectTable.get(penId);
        const count = view.getUint32(dataOff, true);
        const compressed = (recFlags & 16384) !== 0;
        const ptSize = compressed ? 4 : 8;
        if (pen && pen.kind === "plus-pen") {
          applyEmfPlusPen(ctx, pen);
        }
        applyPlusWorldTransform(rCtx);
        ctx.beginPath();
        let pOff = dataOff + 4;
        for (let i = 0; i < count && pOff + ptSize <= dataOff + recDataSize; i++) {
          const pt = readPointFromView(view, pOff, compressed);
          if (i === 0) {
            ctx.moveTo(pt.x, pt.y);
          } else {
            ctx.lineTo(pt.x, pt.y);
          }
          pOff += ptSize;
        }
        if (recFlags & 8192) {
          ctx.closePath();
        }
        ctx.stroke();
      }
      return true;
    }
    case EMFPLUS_FILLPOLYGON: {
      if (recDataSize >= 8) {
        const brushVal = view.getUint32(dataOff, true);
        const count = view.getUint32(dataOff + 4, true);
        const compressed = (recFlags & 16384) !== 0;
        const ptSize = compressed ? 4 : 8;
        ctx.fillStyle = resolveBrushPaint(rCtx, recFlags, brushVal);
        applyPlusWorldTransform(rCtx);
        ctx.beginPath();
        let pOff = dataOff + 8;
        for (let i = 0; i < count && pOff + ptSize <= dataOff + recDataSize; i++) {
          const pt = readPointFromView(view, pOff, compressed);
          if (i === 0) {
            ctx.moveTo(pt.x, pt.y);
          } else {
            ctx.lineTo(pt.x, pt.y);
          }
          pOff += ptSize;
        }
        ctx.closePath();
        ctx.fill();
      }
      return true;
    }
    default:
      return false;
  }
}

// src/emf-plus-object-complex.ts
function parseEmfPlusPenObject(view, dataOff, recDataSize) {
  if (recDataSize < 20) {
    return null;
  }
  const hasVersion = looksLikeGraphicsVersion(view.getUint32(dataOff, true));
  const penFlags = view.getUint32(dataOff + (hasVersion ? 8 : 4), true);
  const penWidth = view.getFloat32(dataOff + 16, true);
  let brushOff = dataOff + 20;
  const flagSizes = [
    [1, 4],
    // Transform (actually 24 bytes)
    [2, 4],
    // StartCap
    [4, 4],
    // EndCap
    [8, 4],
    // Join
    [16, 4],
    // MiterLimit
    [32, 4],
    // LineStyle (DashStyle)
    [64, 4],
    // DashCap
    [128, 4]
    // DashOffset
  ];
  let dashStyle = 0;
  for (const [flag, size] of flagSizes) {
    if (penFlags & flag) {
      if (flag === 1) {
        brushOff += 24;
      } else {
        if (flag === 32 && brushOff + 4 <= dataOff + recDataSize) {
          dashStyle = view.getUint32(brushOff, true);
        }
        brushOff += size;
      }
    }
  }
  if (penFlags & 256) {
    if (brushOff + 4 <= dataOff + recDataSize) {
      const dashCount = view.getUint32(brushOff, true);
      brushOff += 4 + dashCount * 4;
    }
  }
  if (penFlags & 512) {
    if (brushOff + 4 <= dataOff + recDataSize) {
      const compCount = view.getUint32(brushOff, true);
      brushOff += 4 + compCount * 4;
    }
  }
  if (penFlags & 1024) {
    if (brushOff + 4 <= dataOff + recDataSize) {
      const capSize = view.getUint32(brushOff, true);
      brushOff += 4 + capSize;
    }
  }
  if (penFlags & 2048) {
    if (brushOff + 4 <= dataOff + recDataSize) {
      const capSize = view.getUint32(brushOff, true);
      brushOff += 4 + capSize;
    }
  }
  let penColor = "rgba(0,0,0,1)";
  if (brushOff + 8 <= dataOff + recDataSize) {
    const brush = parseEmfPlusBrushObject(view, brushOff, dataOff + recDataSize - brushOff);
    if (brush) {
      penColor = brush.color;
    }
  }
  return { kind: "plus-pen", color: penColor, width: penWidth || 1, dashStyle };
}
function parseEmfPlusImageObject(view, dataOff, recDataSize, objectId) {
  let imgData = null;
  const imgType = view.getUint32(dataOff + 4, true);
  if (imgType === 1 && recDataSize >= 28) {
    const bmpType = view.getUint32(dataOff + 24, true);
    if (bmpType === 0) {
      const bmpW = view.getInt32(dataOff + 8, true);
      const bmpH = view.getInt32(dataOff + 12, true);
      const bmpStride = view.getInt32(dataOff + 16, true);
      const pixelFormat = view.getUint32(dataOff + 20, true);
      emfLog(
        `  Bitmap(Pixel): ${bmpW}\xD7${bmpH}, stride=${bmpStride}, pixelFormat=0x${pixelFormat.toString(16).padStart(8, "0")}`
      );
      const pixelStart = dataOff + 28;
      const absStride = Math.abs(bmpStride);
      if (bmpW > 0 && bmpH > 0 && bmpW <= 8192 && bmpH <= 8192 && pixelStart + absStride * bmpH <= view.byteLength) {
        const decoded = decodeEmfPlusBitmapPixels(
          view,
          pixelStart,
          bmpW,
          bmpH,
          bmpStride,
          pixelFormat
        );
        if (decoded) {
          emfLog(`  Bitmap(Pixel): decoded successfully, size=${decoded.byteLength} bytes`);
          imgData = decoded;
        }
      }
    } else if (bmpType === 1) {
      const imgStart = dataOff + 28;
      const imgLen = recDataSize - 28;
      emfLog(`  Bitmap(Compressed): imgLen=${imgLen}, imgStart=0x${imgStart.toString(16)}`);
      if (imgLen > 0 && imgStart + imgLen <= view.byteLength) {
        imgData = view.buffer.slice(
          view.byteOffset + imgStart,
          view.byteOffset + imgStart + imgLen
        );
        if (imgData.byteLength >= 4) {
          const hdr = new Uint8Array(imgData, 0, 4);
          emfLog(
            `  Bitmap(Compressed): first 4 bytes = [${Array.from(hdr).map((b) => b.toString(16).padStart(2, "0")).join(" ")}]`
          );
        }
      }
    } else ;
  } else if (imgType === 2 && recDataSize >= 12) {
    view.getUint32(dataOff + 8, true);
    const mfDataSize = view.getUint32(dataOff + 12, true);
    const mfStart = dataOff + 16;
    if (mfDataSize > 0 && mfStart + mfDataSize <= view.byteLength) {
      imgData = view.buffer.slice(
        view.byteOffset + mfStart,
        view.byteOffset + mfStart + mfDataSize
      );
      if (imgData.byteLength >= 4) {
        const hdr = new DataView(imgData);
        hdr.getUint32(0, true);
      }
    } else {
      emfWarn(
        `  Metafile: out of bounds or empty (mfStart=0x${mfStart.toString(16)}, mfDataSize=${mfDataSize}, viewLen=${view.byteLength})`
      );
    }
  }
  return { data: imgData, type: imgType };
}
function parseEmfPlusFontObject(view, dataOff, recDataSize) {
  if (recDataSize < 28) {
    return null;
  }
  const emSize = view.getFloat32(dataOff + 4, true);
  const styleFlags = view.getInt32(dataOff + 12, true);
  const nameLen = view.getUint32(dataOff + 20, true);
  let family = "sans-serif";
  if (nameLen > 0 && dataOff + 24 + nameLen * 2 <= dataOff + recDataSize) {
    family = readUtf16LE(view, dataOff + 24, nameLen) || "sans-serif";
  }
  return { kind: "plus-font", emSize: emSize || 12, flags: styleFlags, family };
}

// src/emf-plus-object-parser.ts
function handleEmfPlusObjectRecord(rCtx, recFlags, dataOff, recDataSize) {
  const { view, objectTable } = rCtx;
  const objectId = recFlags & 255;
  const objectType = recFlags >> 8 & 127;
  switch (objectType) {
    // ---------------------------------------------------------------
    // Brush
    // ---------------------------------------------------------------
    case EMFPLUS_OBJECTTYPE_BRUSH: {
      const brush = parseEmfPlusBrushObject(view, dataOff, recDataSize, rCtx.textureCache);
      if (brush) {
        objectTable.set(objectId, brush);
      }
      break;
    }
    // ---------------------------------------------------------------
    // Pen
    // ---------------------------------------------------------------
    case EMFPLUS_OBJECTTYPE_PEN: {
      const pen = parseEmfPlusPenObject(view, dataOff, recDataSize);
      if (pen) {
        objectTable.set(objectId, pen);
      }
      break;
    }
    // ---------------------------------------------------------------
    // Path
    // ---------------------------------------------------------------
    case EMFPLUS_OBJECTTYPE_PATH: {
      const path = parseEmfPlusPath(view, dataOff, recDataSize);
      if (path) {
        objectTable.set(objectId, path);
      }
      break;
    }
    // ---------------------------------------------------------------
    // Font
    // ---------------------------------------------------------------
    case EMFPLUS_OBJECTTYPE_FONT: {
      const font = parseEmfPlusFontObject(view, dataOff, recDataSize);
      if (font) {
        objectTable.set(objectId, font);
      }
      break;
    }
    // ---------------------------------------------------------------
    // StringFormat
    // ---------------------------------------------------------------
    case EMFPLUS_OBJECTTYPE_STRINGFORMAT: {
      if (recDataSize >= 16) {
        const sfFlags = view.getUint32(dataOff + 4, true);
        const alignment = view.getUint32(dataOff + 12, true);
        const lineAlignment = view.getUint32(dataOff + 16, true);
        objectTable.set(objectId, {
          kind: "plus-stringformat",
          flags: sfFlags,
          alignment: alignment ?? 0,
          lineAlignment: lineAlignment ?? 0
        });
      }
      break;
    }
    // ---------------------------------------------------------------
    // Image
    // ---------------------------------------------------------------
    case EMFPLUS_OBJECTTYPE_IMAGE: {
      if (recDataSize < 8) {
        break;
      }
      const parsed = parseEmfPlusImageObject(view, dataOff, recDataSize);
      objectTable.set(objectId, {
        kind: "plus-image",
        data: parsed.data,
        type: parsed.type
      });
      rCtx.totalImageObjects++;
      break;
    }
    // ---------------------------------------------------------------
    // ImageAttributes
    // ---------------------------------------------------------------
    case EMFPLUS_OBJECTTYPE_IMAGEATTRIBUTES: {
      objectTable.set(objectId, { kind: "plus-imageattributes" });
      break;
    }
    // ---------------------------------------------------------------
    // Region
    // ---------------------------------------------------------------
    case EMFPLUS_OBJECTTYPE_REGION: {
      const region = parseEmfPlusRegionObject(view, dataOff, recDataSize);
      if (region) {
        objectTable.set(objectId, region);
      }
      break;
    }
  }
}
var MAX_REGION_NODE_DEPTH = 64;
function parseRegionNode(view, off, endOff, depth = 0) {
  if (off + 4 > endOff) {
    return null;
  }
  if (depth > MAX_REGION_NODE_DEPTH) {
    return null;
  }
  const nodeType = view.getUint32(off, true);
  let cursor = off + 4;
  if (nodeType <= 5) {
    const leftResult = parseRegionNode(view, cursor, endOff, depth + 1);
    if (!leftResult) {
      return null;
    }
    cursor += leftResult.bytesRead;
    const rightResult = parseRegionNode(view, cursor, endOff, depth + 1);
    if (!rightResult) {
      return null;
    }
    cursor += rightResult.bytesRead;
    return {
      node: {
        type: "combine",
        combineMode: nodeType,
        left: leftResult.node,
        right: rightResult.node
      },
      bytesRead: cursor - off
    };
  }
  if (nodeType === 268435456) {
    if (cursor + 16 > endOff) {
      return null;
    }
    const x = view.getFloat32(cursor, true);
    const y = view.getFloat32(cursor + 4, true);
    const w = view.getFloat32(cursor + 8, true);
    const h = view.getFloat32(cursor + 12, true);
    return {
      node: { type: "rect", x, y, width: w, height: h },
      bytesRead: cursor + 16 - off
    };
  }
  if (nodeType === 268435457) {
    if (cursor + 4 > endOff) {
      return null;
    }
    const pathDataSize = view.getInt32(cursor, true);
    cursor += 4;
    if (pathDataSize <= 0 || cursor + pathDataSize > endOff) {
      return null;
    }
    const path = parseEmfPlusPath(view, cursor, pathDataSize);
    return {
      node: path ? { type: "path", path } : { type: "empty" },
      bytesRead: cursor + pathDataSize - off
    };
  }
  if (nodeType === 268435458) {
    return { node: { type: "empty" }, bytesRead: 4 };
  }
  if (nodeType === 268435459) {
    return { node: { type: "infinite" }, bytesRead: 4 };
  }
  emfWarn(`parseRegionNode: unknown node type 0x${nodeType.toString(16)}`);
  return { node: { type: "empty" }, bytesRead: 4 };
}
function parseEmfPlusRegionObject(view, off, maxLen) {
  if (maxLen < 8) {
    return null;
  }
  view.getUint32(off, true);
  const regionNodeCount = view.getUint32(off + 4, true);
  if (regionNodeCount === 0 || regionNodeCount > 1e5) {
    return null;
  }
  const endOff = off + maxLen;
  const result = parseRegionNode(view, off + 8, endOff);
  if (!result) {
    return null;
  }
  return {
    kind: "plus-region",
    nodes: [result.node]
  };
}

// src/emf-plus-text-image-handlers.ts
function handleEmfPlusTextImageRecord(rCtx, recType, recFlags, dataOff, recDataSize) {
  const { ctx, view, objectTable } = rCtx;
  switch (recType) {
    // ---- path-based drawing ----
    case EMFPLUS_FILLPATH: {
      if (recDataSize >= 4) {
        const brushVal = view.getUint32(dataOff, true);
        const pathId = recFlags & 255;
        const pathObj = objectTable.get(pathId);
        if (pathObj && pathObj.kind === "plus-path") {
          ctx.fillStyle = resolveBrushPaint(rCtx, recFlags, brushVal);
          applyPlusWorldTransform(rCtx);
          replayEmfPlusPath(ctx, pathObj);
          ctx.fill();
        }
      }
      return true;
    }
    case EMFPLUS_DRAWPATH: {
      if (recDataSize >= 4) {
        const penIndex = view.getUint32(dataOff, true);
        const pathId = recFlags & 255;
        const pathObj = objectTable.get(pathId);
        const pen = objectTable.get(penIndex & 255);
        if (pathObj && pathObj.kind === "plus-path") {
          if (pen && pen.kind === "plus-pen") {
            ctx.strokeStyle = pen.color;
            ctx.lineWidth = pen.width;
          }
          applyPlusWorldTransform(rCtx);
          replayEmfPlusPath(ctx, pathObj);
          ctx.stroke();
        }
      }
      return true;
    }
    // ---- text ----
    case EMFPLUS_DRAWSTRING: {
      if (recDataSize >= 28) {
        const brushVal = view.getUint32(dataOff, true);
        const formatId = view.getUint32(dataOff + 4, true);
        const strLen = view.getUint32(dataOff + 8, true);
        const layoutX = view.getFloat32(dataOff + 12, true);
        const layoutY = view.getFloat32(dataOff + 16, true);
        view.getFloat32(dataOff + 20, true);
        view.getFloat32(dataOff + 24, true);
        const fontId = recFlags & 255;
        const font = objectTable.get(fontId);
        if (strLen > 0 && dataOff + 28 + strLen * 2 <= dataOff + recDataSize) {
          const text = readUtf16LE(view, dataOff + 28, strLen);
          if (text.length > 0 && font && font.kind === "plus-font") {
            const bold = font.flags & 1 ? "bold " : "";
            const italic = font.flags & 2 ? "italic " : "";
            const family = mapFontFamily(font.family, rCtx.fontFamilyMap);
            ctx.font = `${italic}${bold}${font.emSize}px ${family}`;
            ctx.fillStyle = resolveBrushPaint(rCtx, recFlags, brushVal);
            ctx.textBaseline = "top";
            const sf = objectTable.get(formatId);
            if (sf && sf.kind === "plus-stringformat") {
              switch (sf.alignment) {
                case 1:
                  ctx.textAlign = "center";
                  break;
                case 2:
                  ctx.textAlign = "right";
                  break;
                default:
                  ctx.textAlign = "left";
              }
            } else {
              ctx.textAlign = "left";
            }
            applyPlusWorldTransform(rCtx);
            ctx.fillText(text, layoutX, layoutY);
          }
        }
      }
      return true;
    }
    case EMFPLUS_DRAWDRIVERSTRING: {
      if (recDataSize >= 16) {
        const brushVal = view.getUint32(dataOff, true);
        const glyphCount = view.getUint32(dataOff + 12, true);
        const fontId = recFlags & 255;
        const font = objectTable.get(fontId);
        const glyphsOff = dataOff + 16;
        const posOff = glyphsOff + glyphCount * 2;
        const alignedPosOff = posOff + 3 & -4;
        if (glyphCount > 0 && glyphCount < 1e5 && alignedPosOff + glyphCount * 8 <= dataOff + recDataSize && font && font.kind === "plus-font") {
          const text = readUtf16LE(view, glyphsOff, glyphCount);
          if (text.length > 0) {
            const bold = font.flags & 1 ? "bold " : "";
            const italic = font.flags & 2 ? "italic " : "";
            const family = mapFontFamily(font.family, rCtx.fontFamilyMap);
            ctx.font = `${italic}${bold}${font.emSize}px ${family}`;
            ctx.fillStyle = resolveBrushPaint(rCtx, recFlags, brushVal);
            ctx.textBaseline = "alphabetic";
            ctx.textAlign = "left";
            applyPlusWorldTransform(rCtx);
            const gx = view.getFloat32(alignedPosOff, true);
            const gy = view.getFloat32(alignedPosOff + 4, true);
            ctx.fillText(text, gx, gy);
          }
        }
      }
      return true;
    }
    // ---- images ----
    case EMFPLUS_DRAWIMAGE: {
      if (recDataSize >= 24) {
        const imgId = recFlags & 255;
        const imgObj = objectTable.get(imgId);
        const compressed = (recFlags & 16384) !== 0;
        const rectOff = dataOff + 24;
        let dx, dy, dw, dh;
        if (compressed && rectOff + 8 <= dataOff + recDataSize) {
          dx = view.getInt16(rectOff, true);
          dy = view.getInt16(rectOff + 2, true);
          dw = view.getInt16(rectOff + 4, true);
          dh = view.getInt16(rectOff + 6, true);
        } else if (!compressed && rectOff + 16 <= dataOff + recDataSize) {
          dx = view.getFloat32(rectOff, true);
          dy = view.getFloat32(rectOff + 4, true);
          dw = view.getFloat32(rectOff + 8, true);
          dh = view.getFloat32(rectOff + 12, true);
        } else {
          return true;
        }
        rCtx.totalDrawImageCalls++;
        const hasData = imgObj && imgObj.kind === "plus-image" && imgObj.data;
        emfLog(
          `DrawImage: imgId=${imgId}, dest=(${dx},${dy},${dw},${dh}), compressed=${compressed}, hasObj=${Boolean(imgObj)}, objKind=${imgObj?.kind}, hasData=${Boolean(hasData)}, dataLen=${hasData ? imgObj.data.byteLength : 0}, isMetafile=${imgObj?.kind === "plus-image" ? imgObj.type === 2 : "N/A"}`
        );
        emfLog(
          `DrawImage: worldTransform=[${rCtx.worldTransform.map((v) => v.toFixed(3)).join(", ")}]`
        );
        if (imgObj && imgObj.kind === "plus-image" && imgObj.data) {
          const wt = rCtx.worldTransform;
          const s = getPageUnitMultiplier(rCtx.pageUnit, rCtx.pageScale) * rCtx.dpiScale;
          rCtx.deferredImages.push({
            imageData: imgObj.data,
            dx,
            dy,
            dw,
            dh,
            transform: [
              wt[0] * s,
              wt[1] * s,
              wt[2] * s,
              wt[3] * s,
              wt[4] * s,
              wt[5] * s
            ],
            isMetafile: imgObj.type === 2
          });
          emfLog(`DrawImage: queued deferred image (total=${rCtx.deferredImages.length})`);
        }
      }
      return true;
    }
    case EMFPLUS_DRAWIMAGEPOINTS: {
      if (recDataSize >= 28) {
        const imgId = recFlags & 255;
        const imgObj = objectTable.get(imgId);
        const count = view.getUint32(dataOff + 24, true);
        const compressed = (recFlags & 16384) !== 0;
        const ptOff = dataOff + 28;
        if (count >= 3 && imgObj && imgObj.kind === "plus-image" && imgObj.data) {
          let p1x, p1y, p2x, p2y, p3x, p3y;
          if (compressed && ptOff + 12 <= dataOff + recDataSize) {
            p1x = view.getInt16(ptOff, true);
            p1y = view.getInt16(ptOff + 2, true);
            p2x = view.getInt16(ptOff + 4, true);
            p2y = view.getInt16(ptOff + 6, true);
            p3x = view.getInt16(ptOff + 8, true);
            p3y = view.getInt16(ptOff + 10, true);
          } else if (!compressed && ptOff + 24 <= dataOff + recDataSize) {
            p1x = view.getFloat32(ptOff, true);
            p1y = view.getFloat32(ptOff + 4, true);
            p2x = view.getFloat32(ptOff + 8, true);
            p2y = view.getFloat32(ptOff + 12, true);
            p3x = view.getFloat32(ptOff + 16, true);
            p3y = view.getFloat32(ptOff + 20, true);
          } else {
            return true;
          }
          const dx = p1x;
          const dy = p1y;
          const dw = Math.sqrt((p2x - p1x) ** 2 + (p2y - p1y) ** 2);
          const dh = Math.sqrt((p3x - p1x) ** 2 + (p3y - p1y) ** 2);
          rCtx.totalDrawImageCalls++;
          emfLog(
            `DrawImagePoints: imgId=${imgId}, points=[(${p1x},${p1y}),(${p2x},${p2y}),(${p3x},${p3y})], dest=(${dx.toFixed(1)},${dy.toFixed(1)},${dw.toFixed(1)},${dh.toFixed(1)})`
          );
          emfLog(
            `DrawImagePoints: worldTransform=[${rCtx.worldTransform.map((v) => v.toFixed(3)).join(", ")}]`
          );
          const wt2 = rCtx.worldTransform;
          const s2 = getPageUnitMultiplier(rCtx.pageUnit, rCtx.pageScale) * rCtx.dpiScale;
          rCtx.deferredImages.push({
            imageData: imgObj.data,
            dx,
            dy,
            dw,
            dh,
            transform: [
              wt2[0] * s2,
              wt2[1] * s2,
              wt2[2] * s2,
              wt2[3] * s2,
              wt2[4] * s2,
              wt2[5] * s2
            ],
            isMetafile: imgObj.type === 2
          });
          emfLog(`DrawImagePoints: queued deferred image (total=${rCtx.deferredImages.length})`);
        } else {
          imgObj && imgObj.kind === "plus-image" && imgObj.data;
        }
      }
      return true;
    }
    default:
      return false;
  }
}

// src/emf-plus-replay.ts
var EMFPLUS_REC_NAMES = {
  16385: "Header",
  16386: "EndOfFile",
  16388: "GetDC",
  16392: "Object",
  16394: "FillRects",
  16395: "DrawRects",
  16396: "FillPolygon",
  16397: "DrawLines",
  16398: "FillEllipse",
  16399: "DrawEllipse",
  16404: "FillPath",
  16405: "DrawPath",
  16410: "DrawImage",
  16411: "DrawImagePoints",
  16412: "DrawString",
  16438: "DrawDriverString",
  16414: "SetAntiAliasMode",
  16426: "SetWorldTransform",
  16427: "ResetWorldTransform",
  16428: "MultiplyWorldTransform",
  16432: "SetPageTransform",
  16433: "ResetClip",
  16434: "SetClipRect",
  16435: "SetClipPath",
  16436: "SetClipRegion",
  16437: "OffsetClip",
  16421: "Save",
  16422: "Restore",
  16424: "BeginContainerNoParams",
  16425: "EndContainer"
};
function replayEmfPlusRecords(view, offset, length, ctx, _canvasW, _canvasH, state, dpiScale = 1, maxRecords = MAX_RECORDS_EMFPLUS_DEFAULT, fontFamilyMap, textureCache) {
  const s = state ?? createEmfPlusState();
  const rCtx = {
    ctx,
    view,
    objectTable: s.objectTable,
    worldTransform: s.worldTransform,
    deferredImages: [],
    saveStack: s.saveStack,
    saveIdMap: s.saveIdMap,
    totalImageObjects: 0,
    totalDrawImageCalls: 0,
    clipSaveDepth: s.clipSaveDepth,
    clipRegion: s.clipRegion,
    pageUnit: 2,
    pageScale: 1,
    continuationBuffer: null,
    continuationObjectId: -1,
    continuationObjectType: 0,
    continuationTotalSize: 0,
    continuationOffset: 0,
    dpiScale,
    fontFamilyMap,
    textureCache
  };
  const end = offset + length;
  let recordCount = 0;
  const emfPlusRecordTypes = /* @__PURE__ */ new Map();
  emfLog(`replayEmfPlusRecords: offset=0x${offset.toString(16)}, length=${length}`);
  while (offset + 12 <= end && recordCount < maxRecords) {
    const recType = view.getUint16(offset, true);
    const recFlags = view.getUint16(offset + 2, true);
    const recSize = view.getUint32(offset + 4, true);
    const recDataSize = view.getUint32(offset + 8, true);
    if (recSize < 12 || offset + recSize > end) {
      break;
    }
    recordCount++;
    emfPlusRecordTypes.set(recType, (emfPlusRecordTypes.get(recType) ?? 0) + 1);
    const dataOff = offset + 12;
    switch (recType) {
      case EMFPLUS_HEADER: {
        if (recDataSize >= 16) {
          view.getFloat32(dataOff + 8, true);
          view.getFloat32(dataOff + 12, true);
        }
        break;
      }
      case EMFPLUS_ENDOFFILE:
        offset = end;
        continue;
      case EMFPLUS_GETDC:
        break;
      case EMFPLUS_OBJECT: {
        const isContinuation = (recFlags & 32768) !== 0;
        const objectId = recFlags & 255;
        if (isContinuation) {
          if (rCtx.continuationBuffer === null) {
            if (recDataSize >= 4) {
              const totalSize = view.getUint32(dataOff, true);
              const objectType = recFlags >> 8 & 127;
              const MAX_CONTINUATION_BYTES = 64 * 1024 * 1024;
              const remainingEmfPlusBytes = view.byteLength - dataOff;
              if (!Number.isFinite(totalSize) || totalSize <= 0 || totalSize > MAX_CONTINUATION_BYTES || totalSize > remainingEmfPlusBytes || recDataSize - 4 < 0) ; else {
                rCtx.continuationTotalSize = totalSize;
                rCtx.continuationObjectId = objectId;
                rCtx.continuationObjectType = objectType;
                rCtx.continuationBuffer = new Uint8Array(totalSize);
                const chunkSize = recDataSize - 4;
                const chunk = new Uint8Array(
                  view.buffer,
                  view.byteOffset + dataOff + 4,
                  Math.min(chunkSize, totalSize)
                );
                rCtx.continuationBuffer.set(chunk, 0);
                rCtx.continuationOffset = chunk.length;
              }
            }
          } else {
            const remaining = rCtx.continuationTotalSize - rCtx.continuationOffset;
            const chunk = new Uint8Array(
              view.buffer,
              view.byteOffset + dataOff,
              Math.min(recDataSize, remaining)
            );
            rCtx.continuationBuffer.set(chunk, rCtx.continuationOffset);
            rCtx.continuationOffset += chunk.length;
          }
        } else if (rCtx.continuationBuffer !== null && objectId === rCtx.continuationObjectId) {
          const remaining = rCtx.continuationTotalSize - rCtx.continuationOffset;
          const chunk = new Uint8Array(
            view.buffer,
            view.byteOffset + dataOff,
            Math.min(recDataSize, remaining)
          );
          rCtx.continuationBuffer.set(chunk, rCtx.continuationOffset);
          const completeView = new DataView(
            rCtx.continuationBuffer.buffer,
            rCtx.continuationBuffer.byteOffset,
            rCtx.continuationBuffer.byteLength
          );
          const assembledFlags = rCtx.continuationObjectType << 8 | objectId;
          handleEmfPlusObjectRecord(
            { ...rCtx, view: completeView },
            assembledFlags,
            0,
            rCtx.continuationTotalSize
          );
          rCtx.continuationBuffer = null;
          rCtx.continuationObjectId = -1;
          rCtx.continuationObjectType = 0;
          rCtx.continuationTotalSize = 0;
          rCtx.continuationOffset = 0;
        } else {
          handleEmfPlusObjectRecord(rCtx, recFlags, dataOff, recDataSize);
        }
        break;
      }
      default: {
        const handled = handleEmfPlusDrawRecord(rCtx, recType, recFlags, dataOff, recDataSize) || handleEmfPlusTextImageRecord(rCtx, recType, recFlags, dataOff, recDataSize) || handleEmfPlusStateRecord(rCtx, recType, recFlags, dataOff, recDataSize);
        if (!handled) {
          console.warn(`[emf-converter] Unhandled EMF+ record type: 0x${recType.toString(16)}`);
        }
        break;
      }
    }
    offset += recSize;
  }
  if (recordCount >= maxRecords) {
    console.warn(
      `[emf-converter] EMF+ record limit reached (${maxRecords}). Output may be incomplete.`
    );
  }
  const summary = [];
  for (const [type, cnt] of emfPlusRecordTypes) {
    summary.push(`${EMFPLUS_REC_NAMES[type] ?? `0x${type.toString(16)}`}:${cnt}`);
  }
  emfLog(
    `replayEmfPlusRecords: totalImageObjects=${rCtx.totalImageObjects}, totalDrawImageCalls=${rCtx.totalDrawImageCalls}, deferredImages=${rCtx.deferredImages.length}`
  );
  emfLog(
    `replayEmfPlusRecords: object table has ${rCtx.objectTable.size} entries: [${Array.from(
      rCtx.objectTable.entries()
    ).map(([id, obj]) => `${id}:${obj.kind}`).join(", ")}]`
  );
  if (state) {
    state.worldTransform = rCtx.worldTransform;
    state.saveIdMap = rCtx.saveIdMap;
    state.clipRegion = rCtx.clipRegion ?? null;
    state.clipSaveDepth = rCtx.clipSaveDepth;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return rCtx.deferredImages;
}

// src/emf-record-replay.ts
var GDI_NAMES = {
  1: "EMR_HEADER",
  2: "EMR_POLYBEZIER",
  3: "EMR_POLYGON",
  4: "EMR_POLYLINE",
  5: "EMR_POLYBEZIERTO",
  6: "EMR_POLYLINETO",
  14: "EMR_EOF",
  27: "EMR_MOVETOEX",
  37: "EMR_SELECTOBJECT",
  38: "EMR_CREATEPEN",
  39: "EMR_CREATEBRUSHINDIRECT",
  40: "EMR_DELETEOBJECT",
  42: "EMR_ELLIPSE",
  43: "EMR_RECTANGLE",
  54: "EMR_LINETO",
  59: "EMR_BEGINPATH",
  60: "EMR_ENDPATH",
  62: "EMR_FILLPATH",
  63: "EMR_STROKEANDFILLPATH",
  64: "EMR_STROKEPATH",
  70: "EMR_COMMENT",
  76: "EMR_BITBLT",
  81: "EMR_STRETCHDIBITS",
  84: "EMR_EXTTEXTOUTW",
  85: "EMR_POLYBEZIER16",
  86: "EMR_POLYGON16",
  87: "EMR_POLYLINE16",
  88: "EMR_POLYBEZIERTO16",
  91: "EMR_POLYPOLYGON16"
};
function replayEmfRecords(view, ctx, bounds, canvasW, canvasH, dpiScale = 1, replayOptions = {}) {
  emfLog(
    `replayEmfRecords: bounds=(${bounds.left},${bounds.top})\u2192(${bounds.right},${bounds.bottom}), canvas=${canvasW}\xD7${canvasH}`
  );
  const allDeferredImages = [];
  const emfPlusState = createEmfPlusState();
  const maxRecords = replayOptions.maxRecords ?? MAX_RECORDS_DEFAULT;
  const maxRecordsEmfPlus = replayOptions.maxRecordsEmfPlus ?? MAX_RECORDS_EMFPLUS_DEFAULT;
  const logicalW = bounds.right - bounds.left || 1;
  const logicalH = bounds.bottom - bounds.top || 1;
  const sx = canvasW / logicalW;
  const sy = canvasH / logicalH;
  emfLog(
    `replayEmfRecords: logical=${logicalW}\xD7${logicalH}, scale=(${sx.toFixed(4)},${sy.toFixed(4)})`
  );
  const rCtx = {
    ctx,
    view,
    objectTable: /* @__PURE__ */ new Map(),
    state: { ...defaultState(), fontFamilyMap: replayOptions.fontFamilyMap },
    stateStack: [],
    inPath: false,
    windowOrg: { x: bounds.left, y: bounds.top },
    windowExt: { cx: logicalW, cy: logicalH },
    viewportOrg: { x: 0, y: 0 },
    viewportExt: { cx: canvasW, cy: canvasH },
    useMappingMode: false,
    clipSaveDepth: 0,
    bounds,
    canvasW,
    canvasH,
    sx,
    sy,
    pathCmds: []
  };
  let offset = 0;
  const maxOffset = view.byteLength;
  let recordCount = 0;
  let emfPlusCommentCount = 0;
  const gdiRecordTypes = /* @__PURE__ */ new Map();
  while (offset + 8 <= maxOffset && recordCount < maxRecords) {
    const recType = view.getUint32(offset, true);
    const recSize = view.getUint32(offset + 4, true);
    if (recSize < 8 || offset + recSize > maxOffset) {
      break;
    }
    recordCount++;
    const dataOff = offset + 8;
    gdiRecordTypes.set(recType, (gdiRecordTypes.get(recType) ?? 0) + 1);
    if (recType === EMR_COMMENT) {
      if (recSize >= 16) {
        const commentDataSize = view.getUint32(dataOff, true);
        const sig = view.getUint32(dataOff + 4, true);
        if (sig === EMFPLUS_SIGNATURE && commentDataSize > 4) {
          emfPlusCommentCount++;
          emfLog(
            `replayEmfRecords: EMF+ comment #${emfPlusCommentCount} at offset 0x${offset.toString(16)}, dataSize=${commentDataSize}`
          );
          const deferred = replayEmfPlusRecords(
            view,
            dataOff + 8,
            commentDataSize - 4,
            ctx,
            canvasW,
            canvasH,
            emfPlusState,
            dpiScale,
            maxRecordsEmfPlus,
            replayOptions.fontFamilyMap,
            replayOptions.textureCache
          );
          emfLog(
            `replayEmfRecords: EMF+ comment #${emfPlusCommentCount} returned ${deferred.length} deferred images`
          );
          allDeferredImages.push(...deferred);
        } else if (sig === EMR_COMMENT_PUBLIC_SIGNATURE) {
          emfLog(
            `replayEmfRecords: EMR_COMMENT_PUBLIC at offset 0x${offset.toString(16)}, size=${commentDataSize}`
          );
        } else {
          emfLog(
            `replayEmfRecords: EMR_COMMENT (sig=0x${sig.toString(16).padStart(8, "0")}) at offset 0x${offset.toString(16)}, size=${commentDataSize}`
          );
        }
      }
      offset += recSize;
      continue;
    }
    if (recType === EMR_EOF) {
      const summary = [];
      for (const [type, count] of gdiRecordTypes) {
        summary.push(`${GDI_NAMES[type] ?? `0x${type.toString(16)}`}:${count}`);
      }
      emfLog(
        `replayEmfRecords: total deferred images = ${allDeferredImages.length}, EMF+ object table size = ${emfPlusState.objectTable.size}`
      );
      break;
    }
    if (recType === EMR_SETMETARGN || recType === EMR_SETICMMODE || recType === EMR_SETLAYOUT || recType === EMR_HEADER) {
      offset += recSize;
      continue;
    }
    const handled = handleEmfGdiStateRecord(rCtx, recType, offset, dataOff, recSize) || handleEmfGdiDrawRecord(rCtx, recType, offset, dataOff, recSize) || handleEmfGdiPolyPathRecord(rCtx, recType, offset, dataOff, recSize);
    if (!handled) {
      console.warn(`[emf-converter] Unhandled EMR record type: ${recType}`);
    }
    offset += recSize;
  }
  if (recordCount >= maxRecords) {
    console.warn(
      `[emf-converter] EMF record limit reached (${maxRecords}). Output may be incomplete.`
    );
  }
  return allDeferredImages;
}

// src/wmf-draw-handlers.ts
function handleWmfDrawRecord(wCtx, recType, offset, dataOff, recSize) {
  const { ctx, view, state, coord } = wCtx;
  const { mx, my, mw, mh } = coord;
  switch (recType) {
    case META_MOVETO:
      if (recSize >= 10) {
        state.curY = view.getInt16(dataOff, true);
        state.curX = view.getInt16(dataOff + 2, true);
      }
      return true;
    case META_LINETO:
      if (recSize >= 10) {
        const ly = view.getInt16(dataOff, true);
        const lx = view.getInt16(dataOff + 2, true);
        applyPen(ctx, state);
        ctx.beginPath();
        ctx.moveTo(mx(state.curX), my(state.curY));
        ctx.lineTo(mx(lx), my(ly));
        ctx.stroke();
        state.curX = lx;
        state.curY = ly;
      }
      return true;
    case META_RECTANGLE:
      if (recSize >= 14) {
        const b = view.getInt16(dataOff, true);
        const r = view.getInt16(dataOff + 2, true);
        const t = view.getInt16(dataOff + 4, true);
        const l = view.getInt16(dataOff + 6, true);
        applyBrush(ctx, state);
        ctx.fillRect(mx(l), my(t), mw(r - l), mh(b - t));
        applyPen(ctx, state);
        ctx.strokeRect(mx(l), my(t), mw(r - l), mh(b - t));
      }
      return true;
    case META_ROUNDRECT:
      if (recSize >= 18) {
        const rh = Math.abs(mh(view.getInt16(dataOff, true))) / 2;
        const rw = Math.abs(mw(view.getInt16(dataOff + 2, true))) / 2;
        const b = view.getInt16(dataOff + 4, true);
        const r = view.getInt16(dataOff + 6, true);
        const t = view.getInt16(dataOff + 8, true);
        const l = view.getInt16(dataOff + 10, true);
        const x1 = mx(l), y1 = my(t);
        const w = mw(r - l), h = mh(b - t);
        const radius = Math.min(rw, rh, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x1 + radius, y1);
        ctx.lineTo(x1 + w - radius, y1);
        ctx.arcTo(x1 + w, y1, x1 + w, y1 + radius, radius);
        ctx.lineTo(x1 + w, y1 + h - radius);
        ctx.arcTo(x1 + w, y1 + h, x1 + w - radius, y1 + h, radius);
        ctx.lineTo(x1 + radius, y1 + h);
        ctx.arcTo(x1, y1 + h, x1, y1 + h - radius, radius);
        ctx.lineTo(x1, y1 + radius);
        ctx.arcTo(x1, y1, x1 + radius, y1, radius);
        ctx.closePath();
        applyBrush(ctx, state);
        ctx.fill();
        applyPen(ctx, state);
        ctx.stroke();
      }
      return true;
    case META_ELLIPSE:
      if (recSize >= 14) {
        const b = view.getInt16(dataOff, true);
        const r = view.getInt16(dataOff + 2, true);
        const t = view.getInt16(dataOff + 4, true);
        const l = view.getInt16(dataOff + 6, true);
        ctx.beginPath();
        ctx.ellipse(
          mx((l + r) / 2),
          my((t + b) / 2),
          Math.abs(mw(r - l)) / 2,
          Math.abs(mh(b - t)) / 2,
          0,
          0,
          Math.PI * 2
        );
        applyBrush(ctx, state);
        ctx.fill();
        applyPen(ctx, state);
        ctx.stroke();
      }
      return true;
    case META_ARC:
    case META_PIE:
    case META_CHORD:
      if (recSize >= 22) {
        const endY = view.getInt16(dataOff, true);
        const endX = view.getInt16(dataOff + 2, true);
        const startY = view.getInt16(dataOff + 4, true);
        const startX = view.getInt16(dataOff + 6, true);
        const b = view.getInt16(dataOff + 8, true);
        const r = view.getInt16(dataOff + 10, true);
        const t = view.getInt16(dataOff + 12, true);
        const l = view.getInt16(dataOff + 14, true);
        const cxA = (l + r) / 2;
        const cyA = (t + b) / 2;
        const rxA = Math.abs(r - l) / 2;
        const ryA = Math.abs(b - t) / 2;
        const startAngle = Math.atan2((startY - cyA) / (ryA || 1), (startX - cxA) / (rxA || 1));
        const endAngle = Math.atan2((endY - cyA) / (ryA || 1), (endX - cxA) / (rxA || 1));
        ctx.beginPath();
        if (recType === META_PIE) {
          ctx.moveTo(mx(cxA), my(cyA));
        }
        ctx.ellipse(
          mx(cxA),
          my(cyA),
          Math.abs(mw(rxA)),
          Math.abs(mh(ryA)),
          0,
          startAngle,
          endAngle,
          false
        );
        if (recType === META_PIE || recType === META_CHORD) {
          ctx.closePath();
        }
        if (recType === META_PIE || recType === META_CHORD) {
          applyBrush(ctx, state);
          ctx.fill();
        }
        applyPen(ctx, state);
        ctx.stroke();
      }
      return true;
    // ---- poly ----
    case META_POLYGON:
      if (recSize >= 10) {
        const count = view.getInt16(dataOff, true);
        if (count > 0 && dataOff + 2 + count * 4 <= offset + recSize) {
          ctx.beginPath();
          for (let i = 0; i < count; i++) {
            const px = view.getInt16(dataOff + 2 + i * 4, true);
            const py = view.getInt16(dataOff + 4 + i * 4, true);
            if (i === 0) {
              ctx.moveTo(mx(px), my(py));
            } else {
              ctx.lineTo(mx(px), my(py));
            }
          }
          ctx.closePath();
          applyBrush(ctx, state);
          ctx.fill(state.polyFillMode === 2 ? "nonzero" : "evenodd");
          applyPen(ctx, state);
          ctx.stroke();
        }
      }
      return true;
    case META_POLYLINE:
      if (recSize >= 10) {
        const count = view.getInt16(dataOff, true);
        if (count > 0 && dataOff + 2 + count * 4 <= offset + recSize) {
          ctx.beginPath();
          for (let i = 0; i < count; i++) {
            const px = view.getInt16(dataOff + 2 + i * 4, true);
            const py = view.getInt16(dataOff + 4 + i * 4, true);
            if (i === 0) {
              ctx.moveTo(mx(px), my(py));
            } else {
              ctx.lineTo(mx(px), my(py));
            }
          }
          applyPen(ctx, state);
          ctx.stroke();
        }
      }
      return true;
    case META_POLYPOLYGON:
      if (recSize >= 10) {
        const numPolys = view.getUint16(dataOff, true);
        let polyOff = dataOff + 2;
        const counts = [];
        for (let p = 0; p < numPolys && polyOff + 2 <= offset + recSize; p++) {
          counts.push(view.getInt16(polyOff, true));
          polyOff += 2;
        }
        ctx.beginPath();
        for (const count of counts) {
          if (count > 0 && polyOff + count * 4 <= offset + recSize) {
            for (let i = 0; i < count; i++) {
              const px = view.getInt16(polyOff + i * 4, true);
              const py = view.getInt16(polyOff + i * 4 + 2, true);
              if (i === 0) {
                ctx.moveTo(mx(px), my(py));
              } else {
                ctx.lineTo(mx(px), my(py));
              }
            }
            ctx.closePath();
            polyOff += count * 4;
          }
        }
        applyBrush(ctx, state);
        ctx.fill(state.polyFillMode === 2 ? "nonzero" : "evenodd");
        applyPen(ctx, state);
        ctx.stroke();
      }
      return true;
    // ---- text ----
    case META_TEXTOUT:
      if (recSize >= 12) {
        const nChars = view.getInt16(dataOff, true);
        if (nChars > 0 && dataOff + 2 + nChars <= offset + recSize) {
          let text = "";
          for (let i = 0; i < nChars; i++) {
            const ch = view.getUint8(dataOff + 2 + i);
            if (ch === 0) {
              break;
            }
            text += String.fromCharCode(ch);
          }
          const strBytes = nChars + nChars % 2;
          const txOff = dataOff + 2 + strBytes;
          if (txOff + 4 <= offset + recSize) {
            const ty2 = view.getInt16(txOff, true);
            const txCoord = view.getInt16(txOff + 2, true);
            applyFont(ctx, state, Math.abs(mh(1)));
            ctx.fillStyle = state.textColor;
            ctx.fillText(text, mx(txCoord), my(ty2));
          }
        }
      }
      return true;
    case META_EXTTEXTOUT:
      if (recSize >= 14) {
        const ty2 = view.getInt16(dataOff, true);
        const txCoord = view.getInt16(dataOff + 2, true);
        const nChars = view.getInt16(dataOff + 4, true);
        const hasClipRect = (view.getUint16(dataOff + 6, true) & 4) !== 0;
        const stringOff = dataOff + 8 + (hasClipRect ? 8 : 0);
        if (nChars > 0 && stringOff + nChars <= offset + recSize) {
          let text = "";
          for (let i = 0; i < nChars; i++) {
            const ch = view.getUint8(stringOff + i);
            if (ch === 0) {
              break;
            }
            text += String.fromCharCode(ch);
          }
          applyFont(ctx, state, Math.abs(mh(1)));
          ctx.fillStyle = state.textColor;
          ctx.fillText(text, mx(txCoord), my(ty2));
        }
      }
      return true;
    default:
      return false;
  }
}

// src/wmf-replay.ts
function createWmfCoord(windowOrg, windowExt, canvasW, canvasH) {
  return {
    mx: (x) => (x - windowOrg.x) / (windowExt.cx || 1) * canvasW,
    my: (y) => (y - windowOrg.y) / (windowExt.cy || 1) * canvasH,
    mw: (w) => w / (windowExt.cx || 1) * canvasW,
    mh: (h) => h / (windowExt.cy || 1) * canvasH
  };
}
function replayWmfRecords(view, ctx, header, canvasW, canvasH, replayOptions = {}) {
  const logicalW = header.boundsRight - header.boundsLeft || 1;
  const logicalH = header.boundsBottom - header.boundsTop || 1;
  const windowOrg = { x: header.boundsLeft, y: header.boundsTop };
  const windowExt = { cx: logicalW, cy: logicalH };
  const coord = createWmfCoord(windowOrg, windowExt, canvasW, canvasH);
  const objectTable = /* @__PURE__ */ new Map();
  const allocObjectSlot = () => {
    let slot = 0;
    while (objectTable.has(slot)) {
      slot++;
    }
    return slot;
  };
  const state = { ...defaultState(), fontFamilyMap: replayOptions.fontFamilyMap };
  const stateStack = [];
  const wCtx = { view, ctx, state, coord };
  let offset = header.headerSize;
  const maxOffset = view.byteLength;
  const maxRecords = replayOptions.maxRecords ?? MAX_RECORDS_DEFAULT;
  let recordCount = 0;
  while (offset + 6 <= maxOffset && recordCount < maxRecords) {
    const recSizeWords = view.getUint32(offset, true);
    const recType = view.getUint16(offset + 4, true);
    const recSize = recSizeWords * 2;
    if (recSize < 6 || offset + recSize > maxOffset) {
      break;
    }
    if (recType === META_EOF) {
      break;
    }
    recordCount++;
    const dataOff = offset + 6;
    if (handleWmfDrawRecord(wCtx, recType, offset, dataOff, recSize)) {
      offset += recSize;
      continue;
    }
    switch (recType) {
      case META_SETWINDOWORG:
        if (recSize >= 10) {
          windowOrg.y = view.getInt16(dataOff, true);
          windowOrg.x = view.getInt16(dataOff + 2, true);
        }
        break;
      case META_SETWINDOWEXT:
        if (recSize >= 10) {
          windowExt.cy = view.getInt16(dataOff, true);
          windowExt.cx = view.getInt16(dataOff + 2, true);
        }
        break;
      case META_SAVEDC:
        stateStack.push(cloneState(state));
        break;
      case META_RESTOREDC: {
        const restored = stateStack.pop();
        if (restored) {
          Object.assign(state, restored);
        }
        break;
      }
      case META_SETTEXTCOLOR:
        if (recSize >= 10) {
          state.textColor = readColorRef(view, dataOff);
        }
        break;
      case META_SETBKCOLOR:
        if (recSize >= 10) {
          state.bkColor = readColorRef(view, dataOff);
        }
        break;
      case META_SETBKMODE:
        if (recSize >= 8) {
          state.bkMode = view.getUint16(dataOff, true);
        }
        break;
      case META_SETROP2:
        if (recSize >= 8) {
          state.rop2 = view.getUint16(dataOff, true);
        }
        break;
      case META_SETPOLYFILLMODE:
        if (recSize >= 8) {
          state.polyFillMode = view.getUint16(dataOff, true);
        }
        break;
      case META_SETTEXTALIGN:
        if (recSize >= 8) {
          state.textAlign = view.getUint16(dataOff, true);
        }
        break;
      case META_CREATEPENINDIRECT:
        if (recSize >= 16) {
          const slot = allocObjectSlot();
          objectTable.set(slot, {
            kind: "pen",
            style: view.getUint16(dataOff, true) & 255,
            widthX: view.getInt16(dataOff + 2, true),
            color: readColorRef(view, dataOff + 6)
          });
        }
        break;
      case META_CREATEBRUSHINDIRECT:
        if (recSize >= 14) {
          const slot = allocObjectSlot();
          objectTable.set(slot, {
            kind: "brush",
            style: view.getUint16(dataOff, true),
            color: readColorRef(view, dataOff + 2)
          });
        }
        break;
      case META_CREATEFONTINDIRECT:
        if (recSize >= 24) {
          let family = "";
          for (let i = 0; i < 32 && dataOff + 18 + i < offset + recSize; i++) {
            const ch = view.getUint8(dataOff + 18 + i);
            if (ch === 0) {
              break;
            }
            family += String.fromCharCode(ch);
          }
          const slot = allocObjectSlot();
          objectTable.set(slot, {
            kind: "font",
            // Sign kept (not Math.abs'd): resolveFontPixelHeight() needs it
            // to distinguish GDI's cell-height vs character-height convention.
            height: view.getInt16(dataOff, true),
            weight: view.getInt16(dataOff + 8, true),
            italic: view.getUint8(dataOff + 10) !== 0,
            underline: view.getUint8(dataOff + 11) !== 0,
            strikeOut: view.getUint8(dataOff + 12) !== 0,
            family: family || "sans-serif",
            escapementTenthDeg: view.getInt16(dataOff + 4, true)
          });
        }
        break;
      case META_SELECTOBJECT:
        if (recSize >= 8) {
          const obj = objectTable.get(view.getUint16(dataOff, true));
          if (obj) {
            switch (obj.kind) {
              case "pen":
                state.penStyle = obj.style;
                state.penWidth = obj.widthX;
                state.penColor = obj.color;
                break;
              case "brush":
                state.brushStyle = obj.style;
                state.brushColor = obj.color;
                break;
              case "font":
                state.fontHeight = obj.height;
                state.fontWeight = obj.weight;
                state.fontItalic = obj.italic;
                state.fontUnderline = obj.underline;
                state.fontStrikeOut = obj.strikeOut;
                state.fontFamily = obj.family;
                state.fontEscapementTenthDeg = obj.escapementTenthDeg ?? 0;
                break;
            }
          }
        }
        break;
      case META_DELETEOBJECT:
        if (recSize >= 8) {
          objectTable.delete(view.getUint16(dataOff, true));
        }
        break;
    }
    offset += recSize;
  }
  if (recordCount >= maxRecords) {
    console.warn(
      `[emf-converter] WMF record limit reached (${maxRecords}). Output may be incomplete.`
    );
  }
}

// src/emf-converter.ts
var MAX_METAFILE_RECURSION = 3;
async function processDeferredImages(ctx, deferredImages, recursionDepth = 0) {
  emfLog(
    `processDeferredImages: processing ${deferredImages.length} deferred images (recursionDepth=${recursionDepth})...`
  );
  for (let idx = 0; idx < deferredImages.length; idx++) {
    const img = deferredImages[idx];
    emfLog(
      `  Deferred image [${idx}]: isMetafile=${img.isMetafile}, dataLen=${img.imageData.byteLength}, dest=(${img.dx.toFixed(1)},${img.dy.toFixed(1)},${img.dw.toFixed(1)},${img.dh.toFixed(1)}), transform=[${img.transform.map((v) => v.toFixed(3)).join(",")}]`
    );
    try {
      const plainBuffer = new ArrayBuffer(img.imageData.byteLength);
      const dstBytes = new Uint8Array(plainBuffer);
      dstBytes.set(new Uint8Array(img.imageData));
      ctx.setTransform(
        img.transform[0],
        img.transform[1],
        img.transform[2],
        img.transform[3],
        img.transform[4],
        img.transform[5]
      );
      if (img.isMetafile) {
        if (recursionDepth >= MAX_METAFILE_RECURSION) {
          emfWarn(
            `  Deferred image [${idx}]: skipping embedded metafile, recursion depth ${recursionDepth} >= ${MAX_METAFILE_RECURSION}`
          );
          continue;
        }
        emfLog(`  Deferred image [${idx}]: recursively converting embedded metafile...`);
        const metafileDataUrl = await convertMetafileToDataUrl(
          plainBuffer,
          void 0,
          recursionDepth + 1
        );
        if (metafileDataUrl) {
          emfLog(
            `  Deferred image [${idx}]: metafile converted, dataUrl length=${metafileDataUrl.length}`
          );
          const byteString = atob(metafileDataUrl.split(",")[1]);
          const mimeMatch = metafileDataUrl.match(/data:([^;]+)/);
          const mime = mimeMatch ? mimeMatch[1] : "image/png";
          const ab = new ArrayBuffer(byteString.length);
          const ia = new Uint8Array(ab);
          for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
          }
          emfLog(`  Deferred image [${idx}]: decoding ${ab.byteLength} byte image (${mime})...`);
          const decoded = await decodeDeferredImageBytes(ab, mime);
          if (decoded) {
            emfLog(`  Deferred image [${idx}]: decoded ${decoded.width}\xD7${decoded.height}`);
            canvasDrawImage(ctx, decoded.drawable, img.dx, img.dy, img.dw, img.dh);
            decoded.close();
          } else {
            emfWarn(`  Deferred image [${idx}]: no image decoder available`);
          }
        } else {
          emfWarn(`  Deferred image [${idx}]: metafile conversion returned null`);
        }
      } else {
        emfLog(`  Deferred image [${idx}]: decoding ${plainBuffer.byteLength} byte image...`);
        const decoded = await decodeDeferredImageBytes(plainBuffer);
        if (decoded) {
          emfLog(`  Deferred image [${idx}]: decoded ${decoded.width}\xD7${decoded.height}`);
          canvasDrawImage(ctx, decoded.drawable, img.dx, img.dy, img.dw, img.dh);
          decoded.close();
        } else {
          emfWarn(`  Deferred image [${idx}]: no image decoder available`);
        }
      }
    } catch (imgErr) {
      imgErr instanceof Error ? imgErr.message : String(imgErr);
      console.warn(
        "[emf-converter] Deferred image draw failed:",
        imgErr instanceof Error ? imgErr.message : imgErr,
        `(isMetafile=${img.isMetafile}, dataLen=${img.imageData.byteLength})`
      );
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function extractEmbeddedRaster(buffer) {
  const bytes = new Uint8Array(buffer);
  if (!bytes || bytes.length < 16) return null;
  for (let i = 0; i <= bytes.length - 16; i++) {
    if (bytes[i] === 0x89 && bytes[i + 1] === 0x50 && bytes[i + 2] === 0x4e && bytes[i + 3] === 0x47 &&
        bytes[i + 4] === 0x0d && bytes[i + 5] === 0x0a && bytes[i + 6] === 0x1a && bytes[i + 7] === 0x0a) {
      for (let k = i + 8; k <= bytes.length - 8; k++) {
        if (bytes[k] === 0x49 && bytes[k + 1] === 0x45 && bytes[k + 2] === 0x4e && bytes[k + 3] === 0x44) {
          return { mime: "image/png", data: bytes.subarray(i, k + 8) };
        }
      }
    }
  }
  for (let i = 0; i <= bytes.length - 4; i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd8 && bytes[i + 2] === 0xff) {
      for (let k = i + 3; k <= bytes.length - 2; k++) {
        if (bytes[k] === 0xff && bytes[k + 1] === 0xd9) {
          return { mime: "image/jpeg", data: bytes.subarray(i, k + 2) };
        }
      }
    }
  }
  return null;
}

function uint8ArrayToBase64(bytes) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  const len = bytes.byteLength;
  const chunkSize = 16384;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

async function convertMetafileToDataUrl(buffer, options, recursionDepth = 0) {
  const embedded = extractEmbeddedRaster(buffer);
  if (embedded) {
    const b64 = uint8ArrayToBase64(embedded.data);
    return `data:${embedded.mime};base64,${b64}`;
  }
  await ensureNodeCanvasModule();
  if (recursionDepth > MAX_METAFILE_RECURSION) {
    return null;
  }
  emfLog(`convertMetafileToDataUrl: input buffer ${buffer.byteLength} bytes`);
  if (buffer.byteLength >= 16) {
    const hdrBytes = new Uint8Array(buffer, 0, 16);
    emfLog(
      `convertMetafileToDataUrl: first 16 bytes: [${Array.from(hdrBytes).map((b) => b.toString(16).padStart(2, "0")).join(" ")}]`
    );
  }
  const view = new DataView(buffer);
  let emfHeader = null;
  try {
    emfHeader = parseEmfHeader(view);
  } catch (err) {
    emfWarn(
      "convertMetafileToDataUrl: parseEmfHeader threw during detection:",
      err instanceof Error ? err.message : err
    );
    emfHeader = null;
  }
  if (emfHeader) {
    return convertEmfInternal(buffer, view, emfHeader, options, recursionDepth);
  }
  return convertWmfInternal(buffer, view, options);
}
async function convertEmfInternal(buffer, view, header, options, recursionDepth) {
  const opts = options ?? {};
  const dpiScale = opts.dpiScale ?? DEFAULT_DPI_SCALE;
  const effectiveMaxWidth = opts.maxWidth;
  const effectiveMaxHeight = opts.maxHeight;
  try {
    emfLog("=== convertEmfInternal START ===");
    emfLog(
      `Input buffer: ${buffer.byteLength} bytes, maxWidth=${effectiveMaxWidth}, maxHeight=${effectiveMaxHeight}, dpiScale=${dpiScale}`
    );
    const textureCache = await preDecodeEmfPlusTextures(view);
    const replayOptions = {
      maxRecords: opts.maxRecords,
      maxRecordsEmfPlus: opts.maxRecords,
      fontFamilyMap: opts.fontFamilyMap,
      textureCache
    };
    const renderBounds = getRenderableEmfBounds(header);
    if (!renderBounds) {
      emfLog("convertEmfInternal: getRenderableEmfBounds returned null, returning null");
      return null;
    }
    const logicalW = renderBounds.right - renderBounds.left;
    const logicalH = renderBounds.bottom - renderBounds.top;
    emfLog(`convertEmfInternal: logicalSize=${logicalW}\xD7${logicalH}`);
    const setup = createCanvas(
      logicalW,
      logicalH,
      effectiveMaxWidth,
      effectiveMaxHeight,
      dpiScale,
      opts.maxCanvasDimension
    );
    if (!setup) {
      emfLog("convertEmfInternal: createCanvas returned null, returning null");
      return null;
    }
    const { canvas, ctx } = setup;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    emfLog(
      `convertEmfInternal: canvas created ${canvas.width}\xD7${canvas.height} (dpiScale=${dpiScale})`
    );
    ctx.save();
    emfLog("convertEmfInternal: starting replayEmfRecords...");
    const deferredImages = replayEmfRecords(
      view,
      ctx,
      renderBounds,
      canvas.width,
      canvas.height,
      dpiScale,
      replayOptions
    );
    emfLog(`convertEmfInternal: replayEmfRecords returned ${deferredImages.length} deferred images`);
    ctx.restore();
    await processDeferredImages(ctx, deferredImages, recursionDepth);
    emfLog("convertEmfInternal: exporting canvas to PNG data URL...");
    const result = await exportCanvasToPngDataUrl(canvas);
    if (result) {
      emfLog(`convertEmfInternal: SUCCESS, data URL length=${result.length}`);
    } else {
      emfWarn("convertEmfInternal: exportCanvasToPngDataUrl returned null");
    }
    emfLog("=== convertEmfInternal END ===");
    return result;
  } catch (err) {
    emfWarn("convertEmfInternal: EXCEPTION:", err instanceof Error ? err.message : err);
    console.warn("[emf-converter] EMF conversion failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
async function convertWmfInternal(buffer, view, options, recursionDepth) {
  const opts = options ?? {};
  const dpiScale = opts.dpiScale ?? DEFAULT_DPI_SCALE;
  const effectiveMaxWidth = opts.maxWidth;
  const effectiveMaxHeight = opts.maxHeight;
  const replayOptions = {
    maxRecords: opts.maxRecords,
    fontFamilyMap: opts.fontFamilyMap
  };
  try {
    emfLog(
      "=== convertWmfInternal START ===",
      `buffer=${buffer.byteLength} bytes, dpiScale=${dpiScale}`
    );
    const header = parseWmfHeader(view);
    if (!header) {
      emfLog("convertWmfInternal: parseWmfHeader returned null");
      return null;
    }
    const logicalW = header.boundsRight - header.boundsLeft;
    const logicalH = header.boundsBottom - header.boundsTop;
    emfLog(`convertWmfInternal: logicalSize=${logicalW}\xD7${logicalH}`);
    if (logicalW <= 0 || logicalH <= 0) {
      emfLog("convertWmfInternal: invalid dimensions, returning null");
      return null;
    }
    const setup = createCanvas(
      logicalW,
      logicalH,
      effectiveMaxWidth,
      effectiveMaxHeight,
      dpiScale,
      opts.maxCanvasDimension
    );
    if (!setup) {
      return null;
    }
    const { canvas, ctx } = setup;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    replayWmfRecords(view, ctx, header, canvas.width, canvas.height, replayOptions);
    ctx.restore();
    const result = await exportCanvasToPngDataUrl(canvas);
    emfLog(`convertWmfInternal: result=${result ? `dataUrl len=${result.length}` : "null"}`);
    emfLog("=== convertWmfInternal END ===");
    return result;
  } catch (err) {
    emfWarn("convertWmfInternal: EXCEPTION:", err instanceof Error ? err.message : err);
    console.warn("[emf-converter] WMF conversion failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export { DEFAULT_DPI_SCALE, convertMetafileToDataUrl };

if (typeof window !== "undefined") window.convertMetafileToDataUrl = convertMetafileToDataUrl;
