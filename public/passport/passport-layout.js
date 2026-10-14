/**
 * AURA PRINT PRO — PASSPORT PHOTO SHEET LAYOUT & PDF EXPORTER
 * Owner: Sabir Ansari
 * 
 * Features:
 * - Dynamic grid calculation for 4x6 photo paper and A4 sheets
 * - Precise physical millimeter-to-point transformations (72 pt / 25.4 mm)
 * - Auto-centering and margin distribution with configurable gap spacing
 * - Individual photo black cutting borders and corner trim marks
 * - Real-time canvas sheet preview
 * - High-resolution PDF document generation via pdf-lib
 */

import { PAPER_SIZES } from '/src/shared/constants.js';

// Physical conversion ratio: 72 PostScript points = 1 inch = 25.4 mm
const POINTS_PER_MM = 72 / 25.4; // ~2.834645669

export class PassportSheetLayouter {
  /**
   * @param {Object} options
   * @param {HTMLCanvasElement} options.sheetCanvas
   * @param {HTMLElement} options.emptyNotice
   * @param {HTMLElement} options.dimMetaText
   * @param {HTMLElement} options.gridMetaText
   */
  constructor({
    sheetCanvas,
    emptyNotice,
    dimMetaText,
    gridMetaText
  }) {
    this.canvas = sheetCanvas;
    this.ctx = sheetCanvas.getContext('2d');
    this.emptyNotice = emptyNotice;
    this.dimMeta = dimMetaText;
    this.gridMeta = gridMetaText;

    // Current layout configuration
    this.croppedCanvas = null;
    this.photoMm = { width: 35, height: 45 };
    this.sheetFormatKey = 'PHOTO_4X6'; // 'PHOTO_4X6' or 'A4'
    this.photoCount = 8;
    this.drawBorder = true;
    this.autoCenter = true;

    // Grid geometry cache
    this.layoutGeometry = null;
  }

  /**
   * Updates the active layout configuration and triggers re-render
   * @param {Object} params
   */
  updateLayout({
    croppedPhotoCanvas,
    photoMm,
    sheetFormatKey,
    photoCount,
    drawBorder,
    autoCenter
  }) {
    this.croppedCanvas = croppedPhotoCanvas;
    this.photoMm = photoMm || this.photoMm;
    this.sheetFormatKey = sheetFormatKey || this.sheetFormatKey;
    this.photoCount = photoCount !== undefined ? photoCount : this.photoCount;
    this.drawBorder = drawBorder !== undefined ? drawBorder : this.drawBorder;
    this.autoCenter = autoCenter !== undefined ? autoCenter : this.autoCenter;

    if (this.emptyNotice) {
      this.emptyNotice.classList.add('hidden');
    }

    this.computeGeometry();
    this.renderPreview();
  }

  /**
   * Resolves paper millimeter dimensions based on sheetFormatKey
   * @returns {{ widthMm: number, heightMm: number, name: string }}
   */
  getSheetDimensions() {
    if (this.sheetFormatKey === 'A4') {
      return {
        widthMm: PAPER_SIZES.A4.widthMm, // 210
        heightMm: PAPER_SIZES.A4.heightMm, // 297
        name: 'A4 Full Sheet (210 x 297 mm)'
      };
    }
    // Default: 4x6 Photo Paper
    return {
      widthMm: PAPER_SIZES.PHOTO_4X6.widthMm, // 101.6
      heightMm: PAPER_SIZES.PHOTO_4X6.heightMm, // 152.4
      name: '4 x 6 Inch Photo Paper (101.6 x 152.4 mm)'
    };
  }

  /**
   * Computes optimal columns, rows, spacing, and photo positioning coordinates
   */
  computeGeometry() {
    const paper = this.getSheetDimensions();
    const photoW = this.photoMm.width;
    const photoH = this.photoMm.height;
    const count = this.photoCount;

    // Standard spacing between individual photos
    const gapMm = 3.0; // 3 mm gap between photos
    const minMarginMm = 5.0; // 5 mm safety margin from edge of physical paper

    // Calculate maximum photos that can theoretically fit
    const usableWidth = paper.widthMm - 2 * minMarginMm;
    const usableHeight = paper.heightMm - 2 * minMarginMm;

    const maxCols = Math.max(1, Math.floor((usableWidth + gapMm) / (photoW + gapMm)));
    const maxRows = Math.max(1, Math.floor((usableHeight + gapMm) / (photoH + gapMm)));

    // Choose grid arrangement based on requested photoCount
    let cols = 1;
    let rows = 1;

    if (this.sheetFormatKey === 'PHOTO_4X6') {
      // 4x6 paper is vertically 101.6 mm x 152.4 mm
      // For 35x45mm photos: 2 cols x 4 rows = 8 photos fits nicely
      if (count <= 2) {
        cols = 1; rows = count;
      } else if (count <= 4) {
        cols = 2; rows = 2;
      } else if (count <= 6) {
        cols = 2; rows = 3;
      } else {
        cols = 2; rows = 4;
      }
    } else {
      // A4 paper
      if (count <= 4) {
        cols = 2; rows = 2;
      } else if (count <= 8) {
        cols = 2; rows = 4;
      } else if (count <= 12) {
        cols = 3; rows = 4;
      } else if (count <= 16) {
        cols = 4; rows = 4;
      } else {
        cols = Math.min(maxCols, 5);
        rows = Math.min(maxRows, Math.ceil(count / cols));
      }
    }

    cols = Math.min(cols, maxCols);
    rows = Math.min(rows, maxRows);

    // Grid bounding box in millimeters
    const totalGridWidthMm = cols * photoW + (cols - 1) * gapMm;
    const totalGridHeightMm = rows * photoH + (rows - 1) * gapMm;

    // Margins (centered or fixed minMargin)
    let startXMm = minMarginMm;
    let startYMm = minMarginMm;

    if (this.autoCenter) {
      startXMm = Math.max(minMarginMm, (paper.widthMm - totalGridWidthMm) / 2);
      startYMm = Math.max(minMarginMm, (paper.heightMm - totalGridHeightMm) / 2);
    }

    // Precalculate slots
    const slots = [];
    let placed = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (placed >= count) break;
        const xMm = startXMm + c * (photoW + gapMm);
        const yMm = startYMm + r * (photoH + gapMm);
        slots.push({
          col: c,
          row: r,
          xMm,
          yMm,
          wMm: photoW,
          hMm: photoH
        });
        placed++;
      }
      if (placed >= count) break;
    }

    this.layoutGeometry = {
      paper,
      cols,
      rows,
      placedCount: slots.length,
      gapMm,
      startXMm,
      startYMm,
      totalGridWidthMm,
      totalGridHeightMm,
      slots
    };

    // Update metadata labels in UI
    if (this.dimMeta) {
      this.dimMeta.textContent = `Size: ${paper.widthMm} x ${paper.heightMm} mm`;
    }
    if (this.gridMeta) {
      this.gridMeta.textContent = `Grid: ${cols} cols x ${rows} rows (${slots.length} Photos)`;
    }
  }

  /**
   * Renders the complete photo sheet onto the HTML canvas viewport
   */
  renderPreview() {
    if (!this.layoutGeometry || !this.croppedCanvas) return;

    const { paper, slots } = this.layoutGeometry;
    const canvas = this.canvas;
    const ctx = this.ctx;

    // Render preview canvas at 4x display resolution for crisp text & borders
    const previewScale = 2.0; // 2 pixels per millimeter in preview
    canvas.width = Math.round(paper.widthMm * previewScale);
    canvas.height = Math.round(paper.heightMm * previewScale);

    // Canvas background representing glossy photo paper
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw individual photos
    slots.forEach((slot, index) => {
      const px = Math.round(slot.xMm * previewScale);
      const py = Math.round(slot.yMm * previewScale);
      const pw = Math.round(slot.wMm * previewScale);
      const ph = Math.round(slot.hMm * previewScale);

      // Draw photo
      ctx.drawImage(this.croppedCanvas, px, py, pw, ph);

      // Draw cutting border
      if (this.drawBorder) {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.strokeRect(px, py, pw, ph);
      }

      // Draw corner cutting tick marks
      this.drawCornerTickMarks(ctx, px, py, pw, ph, 4);
    });

    // Outer subtle printable sheet boundary guide
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
  }

  /**
   * Draws small corner tick marks assisting scissors/paper-cutter alignment
   */
  drawCornerTickMarks(ctx, x, y, w, h, tickLen) {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = 0.75;
    ctx.beginPath();

    // Top-Left
    ctx.moveTo(x - tickLen, y); ctx.lineTo(x, y);
    ctx.moveTo(x, y - tickLen); ctx.lineTo(x, y);

    // Top-Right
    ctx.moveTo(x + w, y); ctx.lineTo(x + w + tickLen, y);
    ctx.moveTo(x + w, y - tickLen); ctx.lineTo(x + w, y);

    // Bottom-Left
    ctx.moveTo(x - tickLen, y + h); ctx.lineTo(x, y + h);
    ctx.moveTo(x, y + h); ctx.lineTo(x, y + h + tickLen);

    // Bottom-Right
    ctx.moveTo(x + w, y + h); ctx.lineTo(x + w + tickLen, y + h);
    ctx.moveTo(x + w, y + h); ctx.lineTo(x + w, y + h + tickLen);

    ctx.stroke();
  }

  /**
   * Generates a high-resolution print-ready PDF Blob using pdf-lib
   * @param {Object} metadata
   * @returns {Promise<Blob>}
   */
  async generatePdfBlob(metadata = {}) {
    if (!this.layoutGeometry || !this.croppedCanvas) {
      throw new Error('No cropped photo or layout geometry available to create PDF.');
    }

    if (!window.PDFLib) {
      throw new Error('PDF-Lib engine is not loaded. Cannot export vector PDF.');
    }

    const { PDFDocument, rgb } = window.PDFLib;
    const pdfDoc = await PDFDocument.create();

    const { paper, slots } = this.layoutGeometry;

    // Convert paper dimensions from mm to PDF points
    const pageWidthPt = paper.widthMm * POINTS_PER_MM;
    const pageHeightPt = paper.heightMm * POINTS_PER_MM;

    const page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);

    // Convert high-DPI cropped canvas to PNG data URL
    const photoDataUrl = this.croppedCanvas.toDataURL('image/png', 1.0);
    const photoBytes = await fetch(photoDataUrl).then(res => res.arrayBuffer());
    const embeddedImage = await pdfDoc.embedPng(photoBytes);

    // PDF coordinate system origin (0, 0) is at Bottom-Left.
    // Convert top-left (xMm, yMm) to bottom-left PDF points.
    slots.forEach(slot => {
      const xPt = slot.xMm * POINTS_PER_MM;
      const yPt = (paper.heightMm - (slot.yMm + slot.hMm)) * POINTS_PER_MM;
      const wPt = slot.wMm * POINTS_PER_MM;
      const hPt = slot.hMm * POINTS_PER_MM;

      // Draw photo
      page.drawImage(embeddedImage, {
        x: xPt,
        y: yPt,
        width: wPt,
        height: hPt
      });

      // Draw cutting border if enabled
      if (this.drawBorder) {
        page.drawRectangle({
          x: xPt,
          y: yPt,
          width: wPt,
          height: hPt,
          borderColor: rgb(0, 0, 0),
          borderWidth: 0.5
        });
      }
    });

    // Set PDF metadata
    pdfDoc.setTitle(`AURA Print Pro — Passport Photos (${metadata.presetName || 'Standard'})`);
    pdfDoc.setAuthor('AURA Print Pro by Sabir Ansari');
    pdfDoc.setProducer('AURA Print Pro Passport Photo Engine');
    pdfDoc.setCreationDate(new Date());

    const pdfBytes = await pdfDoc.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
  }

  /**
   * Generates and triggers browser download of the PDF sheet
   * @param {Object} metadata
   */
  async exportSheetPdf(metadata = {}) {
    const blob = await this.generatePdfBlob(metadata);
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `AURA_Passport_${this.sheetFormatKey}_${Date.now()}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }
}
