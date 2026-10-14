/**
 * AURA PRINT PRO — PASSPORT PHOTO STUDIO CONTROLLER
 * Owner: Sabir Ansari
 * 
 * Features:
 * - Image ingestion (File picker + drag & drop)
 * - Biometric aspect ratio framing (35x45mm, 2x2", Stamp, Custom)
 * - Interactive canvas pan, zoom (0.5x to 3.0x), 90-degree rotation & mirror flip
 * - Client-side non-destructive brightness & contrast filter adjustments
 * - Real-time synchronization with sheet layouter engine
 * - Separate photo sheet billing calculation (4x6 photo vs A4 glossy sheet)
 */

import { PASSPORT_PRESETS, PAPER_SIZES, DEFAULT_RATES } from '/src/shared/constants.js';
import { formatINR } from '/src/shared/formatters.js';
import { PassportSheetLayouter } from './passport-layout.js';

export class PassportStudioApp {
  constructor() {
    this.shopId = this.resolveShopId();
    this.sourceImage = null;
    this.imageLoaded = false;

    // Viewport transform state
    this.transform = {
      zoom: 1.0,
      rotationDeg: 0,
      flipH: false,
      brightness: 0,
      contrast: 0,
      panX: 0,
      panY: 0
    };

    // Active preset and dimension state (defaults to Indian 35x45mm)
    this.currentPresetKey = 'in-std';
    this.photoDimensionsMm = {
      width: 35,
      height: 45
    };

    // Active sheet layout state
    this.sheetFormatKey = 'PHOTO_4X6'; // 'PHOTO_4X6' or 'A4'
    this.photoCount = 8;
    this.drawCutBorders = true;
    this.autoCenterGrid = true;

    // Drag-to-pan state
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };

    this.cacheDom();
    this.layouter = new PassportSheetLayouter({
      sheetCanvas: this.dom.sheetCanvas,
      emptyNotice: this.dom.sheetEmptyNotice,
      dimMetaText: this.dom.sheetDimensionsText,
      gridMetaText: this.dom.gridDimensionsText
    });

    this.bindEvents();
    this.updatePresetDisplay();
    this.updatePricingBreakdown();
  }

  resolveShopId() {
    const params = new URLSearchParams(window.location.search);
    return (params.get('shop') || 'general').trim().toLowerCase();
  }

  cacheDom() {
    this.dom = {
      studioShopCode: document.getElementById('studioShopCode'),
      studioAlert: document.getElementById('studioAlert'),
      studioAlertText: document.getElementById('studioAlertText'),
      btnUploadTrigger: document.getElementById('btnUploadTrigger'),
      photoFileInput: document.getElementById('photoFileInput'),
      cropViewport: document.getElementById('cropViewport'),
      editorEmptyState: document.getElementById('editorEmptyState'),
      cropCanvas: document.getElementById('cropCanvas'),
      biometricGuide: document.getElementById('biometricGuide'),
      presetDimensionTag: document.getElementById('presetDimensionTag'),
      zoomSlider: document.getElementById('zoomSlider'),
      zoomValDisplay: document.getElementById('zoomValDisplay'),
      btnRotate90: document.getElementById('btnRotate90'),
      btnFlipH: document.getElementById('btnFlipH'),
      btnResetCrop: document.getElementById('btnResetCrop'),
      brightnessSlider: document.getElementById('brightnessSlider'),
      brightnessVal: document.getElementById('brightnessVal'),
      contrastSlider: document.getElementById('contrastSlider'),
      contrastVal: document.getElementById('contrastVal'),
      presetSelect: document.getElementById('presetSelect'),
      customDimBox: document.getElementById('customDimBox'),
      customWidthMm: document.getElementById('customWidthMm'),
      customHeightMm: document.getElementById('customHeightMm'),
      photoCountSelect: document.getElementById('photoCountSelect'),
      chkDrawBorder: document.getElementById('chkDrawBorder'),
      chkAutoCenter: document.getElementById('chkAutoCenter'),
      pricingPaperName: document.getElementById('pricingPaperName'),
      pricingPhotoCount: document.getElementById('pricingPhotoCount'),
      pricingTotalAmount: document.getElementById('pricingTotalAmount'),
      sheetCanvas: document.getElementById('sheetCanvas'),
      sheetEmptyNotice: document.getElementById('sheetEmptyNotice'),
      sheetDimensionsText: document.getElementById('sheetDimensionsText'),
      gridDimensionsText: document.getElementById('gridDimensionsText'),
      btnRefreshSheet: document.getElementById('btnRefreshSheet'),
      btnDownloadSheetPdf: document.getElementById('btnDownloadSheetPdf'),
      btnSendToPrintQueue: document.getElementById('btnSendToPrintQueue')
    };

    if (this.dom.studioShopCode) {
      this.dom.studioShopCode.textContent = this.shopId.toUpperCase();
    }
  }

  bindEvents() {
    // 1. File Upload
    this.dom.btnUploadTrigger.addEventListener('click', () => {
      this.dom.photoFileInput.click();
    });

    this.dom.photoFileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) this.loadFile(file);
    });

    // Drag-and-drop on crop viewport
    ['dragenter', 'dragover'].forEach(name => {
      this.dom.cropViewport.addEventListener(name, (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    });

    this.dom.cropViewport.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length > 0) {
        this.loadFile(files[0]);
      }
    });

    // 2. Mouse & Touch Drag to Pan
    this.dom.cropViewport.addEventListener('mousedown', (e) => this.onDragStart(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => this.onDragMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', () => this.onDragEnd());

    this.dom.cropViewport.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        this.onDragStart(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) {
        this.onDragMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    window.addEventListener('touchend', () => this.onDragEnd());

    // 3. Zoom Slider
    this.dom.zoomSlider.addEventListener('input', (e) => {
      this.transform.zoom = parseFloat(e.target.value);
      this.dom.zoomValDisplay.textContent = `${this.transform.zoom.toFixed(2)}x`;
      this.renderCropCanvas();
    });

    // 4. Rotate 90 degrees
    this.dom.btnRotate90.addEventListener('click', () => {
      this.transform.rotationDeg = (this.transform.rotationDeg + 90) % 360;
      this.renderCropCanvas();
    });

    // 5. Flip horizontal (mirror)
    this.dom.btnFlipH.addEventListener('click', () => {
      this.transform.flipH = !this.transform.flipH;
      this.renderCropCanvas();
    });

    // 6. Reset transforms
    this.dom.btnResetCrop.addEventListener('click', () => {
      this.resetTransform();
      this.renderCropCanvas();
    });

    // 7. Brightness & Contrast
    this.dom.brightnessSlider.addEventListener('input', (e) => {
      this.transform.brightness = parseInt(e.target.value, 10);
      this.dom.brightnessVal.textContent = this.transform.brightness;
      this.renderCropCanvas();
    });

    this.dom.contrastSlider.addEventListener('input', (e) => {
      this.transform.contrast = parseInt(e.target.value, 10);
      this.dom.contrastVal.textContent = this.transform.contrast;
      this.renderCropCanvas();
    });

    // 8. Preset Selection
    this.dom.presetSelect.addEventListener('change', (e) => {
      this.currentPresetKey = e.target.value;
      this.handlePresetChange();
    });

    // Custom millimeter inputs
    this.dom.customWidthMm.addEventListener('input', () => this.handleCustomDimensions());
    this.dom.customHeightMm.addEventListener('input', () => this.handleCustomDimensions());

    // 9. Sheet Format Radios
    const sheetRadios = document.querySelectorAll('input[name="sheetFormat"]');
    sheetRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.sheetFormatKey = e.target.value;
        this.updatePricingBreakdown();
        this.syncWithLayouter();
      });
    });

    // 10. Photo Count Selection
    this.dom.photoCountSelect.addEventListener('change', (e) => {
      this.photoCount = parseInt(e.target.value, 10);
      this.updatePricingBreakdown();
      this.syncWithLayouter();
    });

    // 11. Border & Auto-center Checkboxes
    this.dom.chkDrawBorder.addEventListener('change', (e) => {
      this.drawCutBorders = e.target.checked;
      this.syncWithLayouter();
    });

    this.dom.chkAutoCenter.addEventListener('change', (e) => {
      this.autoCenterGrid = e.target.checked;
      this.syncWithLayouter();
    });

    // 12. Manual Refresh & Export Actions
    this.dom.btnRefreshSheet.addEventListener('click', () => this.syncWithLayouter());

    this.dom.btnDownloadSheetPdf.addEventListener('click', async () => {
      this.setButtonLoading(this.dom.btnDownloadSheetPdf, true, 'Generating PDF...');
      try {
        await this.layouter.exportSheetPdf({
          shopId: this.shopId,
          presetName: this.getPresetName()
        });
      } catch (err) {
        this.showAlert(`PDF Export failed: ${err.message}`);
      } finally {
        this.setButtonLoading(this.dom.btnDownloadSheetPdf, false, '📥 Download Print-Ready PDF');
      }
    });

    this.dom.btnSendToPrintQueue.addEventListener('click', async () => {
      await this.dispatchToPrintQueue();
    });
  }

  showAlert(msg) {
    if (!this.dom.studioAlert || !this.dom.studioAlertText) return;
    if (!msg) {
      this.dom.studioAlert.classList.add('hidden');
      return;
    }
    this.dom.studioAlertText.textContent = msg;
    this.dom.studioAlert.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  clearAlert() {
    if (this.dom.studioAlert) {
      this.dom.studioAlert.classList.add('hidden');
    }
  }

  loadFile(file) {
    this.clearAlert();
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!validTypes.includes(file.type.toLowerCase())) {
      this.showAlert('Invalid file format. Please upload a JPEG or PNG photo.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        this.sourceImage = img;
        this.imageLoaded = true;
        this.resetTransform();
        this.enableControls();
        this.renderCropCanvas();
        this.syncWithLayouter();
      };
      img.onerror = () => {
        this.showAlert('Could not read image data. The file might be corrupted.');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  enableControls() {
    this.dom.editorEmptyState.classList.add('hidden');
    this.dom.cropCanvas.classList.remove('hidden');
    this.dom.biometricGuide.classList.remove('hidden');

    this.dom.zoomSlider.disabled = false;
    this.dom.btnRotate90.disabled = false;
    this.dom.btnFlipH.disabled = false;
    this.dom.btnResetCrop.disabled = false;
    this.dom.brightnessSlider.disabled = false;
    this.dom.contrastSlider.disabled = false;

    this.dom.btnDownloadSheetPdf.disabled = false;
    this.dom.btnSendToPrintQueue.disabled = false;
  }

  resetTransform() {
    this.transform = {
      zoom: 1.0,
      rotationDeg: 0,
      flipH: false,
      brightness: 0,
      contrast: 0,
      panX: 0,
      panY: 0
    };
    this.dom.zoomSlider.value = '1.0';
    this.dom.zoomValDisplay.textContent = '1.0x';
    this.dom.brightnessSlider.value = '0';
    this.dom.brightnessVal.textContent = '0';
    this.dom.contrastSlider.value = '0';
    this.dom.contrastVal.textContent = '0';
  }

  onDragStart(x, y) {
    if (!this.imageLoaded) return;
    this.isDragging = true;
    this.dragStart = { x: x - this.transform.panX, y: y - this.transform.panY };
  }

  onDragMove(x, y) {
    if (!this.isDragging || !this.imageLoaded) return;
    this.transform.panX = x - this.dragStart.x;
    this.transform.panY = y - this.dragStart.y;
    this.renderCropCanvas();
  }

  onDragEnd() {
    if (this.isDragging) {
      this.isDragging = false;
      this.syncWithLayouter();
    }
  }

  handlePresetChange() {
    if (this.currentPresetKey === 'custom') {
      this.dom.customDimBox.classList.remove('hidden');
      this.handleCustomDimensions();
    } else {
      this.dom.customDimBox.classList.add('hidden');
      if (this.currentPresetKey === 'in-std') {
        this.photoDimensionsMm = { width: 35, height: 45 };
      } else if (this.currentPresetKey === 'us-visa') {
        this.photoDimensionsMm = { width: 50.8, height: 50.8 };
      } else if (this.currentPresetKey === 'stamp') {
        this.photoDimensionsMm = { width: 25, height: 30 };
      }
    }
    this.updatePresetDisplay();
    this.renderCropCanvas();
    this.syncWithLayouter();
  }

  handleCustomDimensions() {
    const w = parseFloat(this.dom.customWidthMm.value) || 35;
    const h = parseFloat(this.dom.customHeightMm.value) || 45;
    this.photoDimensionsMm = {
      width: Math.max(15, Math.min(w, 150)),
      height: Math.max(15, Math.min(h, 150))
    };
    this.updatePresetDisplay();
    this.renderCropCanvas();
    this.syncWithLayouter();
  }

  updatePresetDisplay() {
    const tag = `${this.photoDimensionsMm.width} x ${this.photoDimensionsMm.height} mm`;
    this.dom.presetDimensionTag.textContent = tag;

    // Adjust biometric guide aspect ratio
    const ratio = this.photoDimensionsMm.width / this.photoDimensionsMm.height;
    const guideBaseHeight = 270;
    const guideWidth = Math.round(guideBaseHeight * ratio);
    this.dom.biometricGuide.style.height = `${guideBaseHeight}px`;
    this.dom.biometricGuide.style.width = `${guideWidth}px`;
  }

  getPresetName() {
    if (this.currentPresetKey === 'in-std') return 'Indian Passport (35x45mm)';
    if (this.currentPresetKey === 'us-visa') return 'US Visa (2x2")';
    if (this.currentPresetKey === 'stamp') return 'Stamp Size (25x30mm)';
    return `Custom (${this.photoDimensionsMm.width}x${this.photoDimensionsMm.height}mm)`;
  }

  /**
   * Renders the interactive preview canvas with filters and position
   */
  renderCropCanvas() {
    if (!this.imageLoaded || !this.sourceImage) return;

    const canvas = this.dom.cropCanvas;
    const ctx = canvas.getContext('2d');
    const viewport = this.dom.cropViewport;

    // Match physical pixels with DPR
    const dpr = window.devicePixelRatio || 1;
    canvas.width = viewport.clientWidth * dpr;
    canvas.height = viewport.clientHeight * dpr;
    ctx.scale(dpr, dpr);

    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;

    ctx.clearRect(0, 0, vw, vh);

    // Apply color filters
    const b = 100 + this.transform.brightness;
    const c = 100 + this.transform.contrast;
    ctx.filter = `brightness(${b}%) contrast(${c}%)`;

    ctx.save();
    // Center of viewport
    ctx.translate(vw / 2 + this.transform.panX, vh / 2 + this.transform.panY);
    ctx.rotate((this.transform.rotationDeg * Math.PI) / 180);
    if (this.transform.flipH) {
      ctx.scale(-1, 1);
    }

    const drawW = this.sourceImage.naturalWidth * this.transform.zoom;
    const drawH = this.sourceImage.naturalHeight * this.transform.zoom;

    ctx.drawImage(this.sourceImage, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
    ctx.filter = 'none';
  }

  /**
   * Generates a high-DPI (300 DPI) single cropped portrait photo canvas
   * matching exact preset millimeter dimensions.
   */
  getCroppedPhotoCanvas() {
    if (!this.imageLoaded || !this.sourceImage) return null;

    // Standard 300 DPI pixel conversion: 1 mm ≈ 11.811 pixels (300 / 25.4)
    const dpmm = 300 / 25.4;
    const targetW = Math.round(this.photoDimensionsMm.width * dpmm);
    const targetH = Math.round(this.photoDimensionsMm.height * dpmm);

    const outCanvas = document.createElement('canvas');
    outCanvas.width = targetW;
    outCanvas.height = targetH;
    const ctx = outCanvas.getContext('2d');

    // Guide dimensions on screen
    const guideW = parseFloat(this.dom.biometricGuide.style.width);
    const guideH = parseFloat(this.dom.biometricGuide.style.height);

    const scaleFactor = targetH / guideH;

    // Apply color filters
    const b = 100 + this.transform.brightness;
    const c = 100 + this.transform.contrast;
    ctx.filter = `brightness(${b}%) contrast(${c}%)`;

    ctx.save();
    ctx.translate(targetW / 2 + this.transform.panX * scaleFactor, targetH / 2 + this.transform.panY * scaleFactor);
    ctx.rotate((this.transform.rotationDeg * Math.PI) / 180);
    if (this.transform.flipH) {
      ctx.scale(-1, 1);
    }

    const drawW = this.sourceImage.naturalWidth * this.transform.zoom * scaleFactor;
    const drawH = this.sourceImage.naturalHeight * this.transform.zoom * scaleFactor;

    ctx.drawImage(this.sourceImage, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
    ctx.filter = 'none';

    return outCanvas;
  }

  updatePricingBreakdown() {
    const isA4 = this.sheetFormatKey === 'A4';
    const paperName = isA4 ? 'A4 Full Sheet Glossy' : '4 x 6 Inch Photo Paper';
    const totalAmount = isA4 ? (DEFAULT_RATES.passportSheetA4 || 50) : (DEFAULT_RATES.passportSheet4x6 || 30);

    this.dom.pricingPaperName.textContent = paperName;
    this.dom.pricingPhotoCount.textContent = `${this.photoCount} Photos`;
    this.dom.pricingTotalAmount.textContent = formatINR(totalAmount);
  }

  syncWithLayouter() {
    if (!this.imageLoaded) return;
    const croppedCanvas = this.getCroppedPhotoCanvas();
    if (!croppedCanvas) return;

    this.layouter.updateLayout({
      croppedPhotoCanvas: croppedCanvas,
      photoMm: this.photoDimensionsMm,
      sheetFormatKey: this.sheetFormatKey,
      photoCount: this.photoCount,
      drawBorder: this.drawCutBorders,
      autoCenter: this.autoCenterGrid
    });
  }

  async dispatchToPrintQueue() {
    if (!this.imageLoaded) return;

    this.setButtonLoading(this.dom.btnSendToPrintQueue, true, 'Sending to Queue...');

    try {
      const pdfBlob = await this.layouter.generatePdfBlob({
        shopId: this.shopId,
        presetName: this.getPresetName()
      });

      const isA4 = this.sheetFormatKey === 'A4';
      const totalAmount = isA4 ? (DEFAULT_RATES.passportSheetA4 || 50) : (DEFAULT_RATES.passportSheet4x6 || 30);

      const formData = new FormData();
      formData.append('documentFile', pdfBlob, `passport_${Date.now()}.pdf`);
      formData.append('shopId', this.shopId);
      formData.append('isPassportStudio', 'true');
      formData.append('quoteSnapshot', JSON.stringify({
        billingType: 'PASSPORT_PHOTO_SHEET',
        sheetFormat: this.sheetFormatKey,
        photoCount: this.photoCount,
        preset: this.getPresetName(),
        totalPhysicalSheets: 1,
        totalAmount,
        currency: 'INR'
      }));

      const res = await fetch('/api/create-order?action=passportJob', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Server error while dispatching print job.');
      }

      const resData = await res.json();
      alert(`Success! Passport sheet sent to Print Queue with Order ID: ${resData.orderId || 'SUCCESS'}`);
    } catch (err) {
      this.showAlert(`Print queue dispatch failed: ${err.message}`);
    } finally {
      this.setButtonLoading(this.dom.btnSendToPrintQueue, false, '🖨️ Send to Windows Print Queue');
    }
  }

  setButtonLoading(btn, isLoading, text) {
    if (!btn) return;
    btn.disabled = isLoading;
    btn.textContent = text;
  }
}

// Bootstrap Passport Photo Studio on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.AuraPassportStudio = new PassportStudioApp();
});
