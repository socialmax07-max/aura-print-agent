/**
 * AURA PRINT PRO — CUSTOMER KIOSK PREVIEW & CANVAS ENGINE
 * Owner: Sabir Ansari
 * 
 * Features:
 * - PDF.js multi-page canvas rendering with Hi-DPI devicePixelRatio support
 * - Fast page switching with RenderTask cancellation protection
 * - Zoom controls (Zoom In, Zoom Out, Zoom Fit to Viewport)
 * - Image pan, rotate (90° increments), and transform snapshot exporter
 * - Synchronizes active page indicators and toolbar buttons
 */

export class KioskPreviewManager {
  /**
   * @param {Object} options
   * @param {HTMLCanvasElement} options.canvasElement
   * @param {HTMLElement} options.viewportElement
   * @param {HTMLElement} options.pageCounterElement
   * @param {HTMLButtonElement} options.btnPrev
   * @param {HTMLButtonElement} options.btnNext
   * @param {HTMLButtonElement} options.btnZoomIn
   * @param {HTMLButtonElement} options.btnZoomOut
   * @param {HTMLButtonElement} options.btnZoomFit
   * @param {HTMLElement} options.imageControlsOverlay
   * @param {HTMLButtonElement} options.btnImgRotate
   * @param {HTMLButtonElement} options.btnImgReset
   * @param {Function} [options.onTransformChange]
   */
  constructor({
    canvasElement,
    viewportElement,
    pageCounterElement,
    btnPrev,
    btnNext,
    btnZoomIn,
    btnZoomOut,
    btnZoomFit,
    imageControlsOverlay,
    btnImgRotate,
    btnImgReset,
    onTransformChange
  }) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.viewport = viewportElement;
    this.pageCounter = pageCounterElement;
    this.btnPrev = btnPrev;
    this.btnNext = btnNext;
    this.btnZoomIn = btnZoomIn;
    this.btnZoomOut = btnZoomOut;
    this.btnZoomFit = btnZoomFit;
    this.imageControlsOverlay = imageControlsOverlay;
    this.btnImgRotate = btnImgRotate;
    this.btnImgReset = btnImgReset;
    this.onTransformChange = onTransformChange || (() => {});

    // Document state
    this.docModel = null;
    this.currentPage = 1;
    this.totalPages = 1;
    this.currentScale = 1.0;
    this.activeRenderTask = null;

    // Image manipulation state
    this.imageTransform = {
      rotationDeg: 0,
      scale: 1.0,
      offsetX: 0,
      offsetY: 0
    };

    this.bindEvents();
  }

  bindEvents() {
    this.btnPrev.addEventListener('click', () => this.navigatePage(-1));
    this.btnNext.addEventListener('click', () => this.navigatePage(1));

    this.btnZoomIn.addEventListener('click', () => this.adjustZoom(0.2));
    this.btnZoomOut.addEventListener('click', () => this.adjustZoom(-0.2));
    this.btnZoomFit.addEventListener('click', () => this.zoomFit());

    if (this.btnImgRotate) {
      this.btnImgRotate.addEventListener('click', () => this.rotateImage90());
    }
    if (this.btnImgReset) {
      this.btnImgReset.addEventListener('click', () => this.resetImageTransform());
    }
  }

  /**
   * Initializes preview with a validated document model from KioskUploadHandler.
   * @param {Object} documentModel 
   */
  async loadDocument(documentModel) {
    this.docModel = documentModel;
    this.currentPage = 1;
    this.totalPages = documentModel.totalPages || 1;
    this.currentScale = 1.0;

    this.resetImageTransform(false);

    if (this.docModel.fileType === 'IMAGE') {
      if (this.imageControlsOverlay) {
        this.imageControlsOverlay.classList.remove('hidden');
      }
      this.updateNavigationUI();
      this.renderImage();
    } else {
      if (this.imageControlsOverlay) {
        this.imageControlsOverlay.classList.add('hidden');
      }
      this.updateNavigationUI();
      await this.zoomFit();
    }
  }

  /**
   * Changes current visible page by delta (-1 or +1).
   * @param {number} delta 
   */
  async navigatePage(delta) {
    if (!this.docModel || this.docModel.fileType !== 'PDF') return;

    const newPage = this.currentPage + delta;
    if (newPage >= 1 && newPage <= this.totalPages) {
      this.currentPage = newPage;
      this.updateNavigationUI();
      await this.renderPdfPage();
    }
  }

  /**
   * Directly jumps to a specified page index (1-based).
   * @param {number} pageNum 
   */
  async goToPage(pageNum) {
    if (!this.docModel || this.docModel.fileType !== 'PDF') return;
    if (pageNum >= 1 && pageNum <= this.totalPages) {
      this.currentPage = pageNum;
      this.updateNavigationUI();
      await this.renderPdfPage();
    }
  }

  updateNavigationUI() {
    this.pageCounter.textContent = `पेज ${this.currentPage} / ${this.totalPages}`;
    this.btnPrev.disabled = this.currentPage <= 1;
    this.btnNext.disabled = this.currentPage >= this.totalPages;
  }

  /**
   * Adjusts zoom factor within reasonable display limits (0.4x to 3.0x).
   * @param {number} delta 
   */
  async adjustZoom(delta) {
    const targetScale = Math.min(Math.max(this.currentScale + delta, 0.4), 3.0);
    if (Math.abs(targetScale - this.currentScale) < 0.01) return;

    this.currentScale = targetScale;
    if (this.docModel?.fileType === 'PDF') {
      await this.renderPdfPage();
    } else if (this.docModel?.fileType === 'IMAGE') {
      this.renderImage();
    }
  }

  /**
   * Automatically calculates scale factor so the document fits comfortably inside viewport.
   */
  async zoomFit() {
    if (!this.docModel) return;

    const viewportWidth = this.viewport.clientWidth - 32; // subtracting padding
    if (viewportWidth <= 0) return;

    if (this.docModel.fileType === 'PDF') {
      try {
        const page = await this.docModel.pdfDoc.getPage(this.currentPage);
        const unscaledViewport = page.getViewport({ scale: 1.0 });
        this.currentScale = Math.min(viewportWidth / unscaledViewport.width, 1.4);
        await this.renderPdfPage();
      } catch (err) {
        console.error('[KioskPreview] zoomFit failed:', err);
      }
    } else {
      const img = this.docModel.imgElement;
      if (img && img.naturalWidth) {
        this.currentScale = Math.min(viewportWidth / img.naturalWidth, 1.0);
        this.renderImage();
      }
    }
  }

  /**
   * High-definition rendering of a single PDF page with Hi-DPI Retina support.
   */
  async renderPdfPage() {
    if (!this.docModel?.pdfDoc) return;

    // Cancel previous render task if user flipped pages quickly
    if (this.activeRenderTask) {
      try {
        this.activeRenderTask.cancel();
      } catch {
        // Ignored cancellation exception
      }
      this.activeRenderTask = null;
    }

    try {
      const page = await this.docModel.pdfDoc.getPage(this.currentPage);
      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: this.currentScale });

      // Physical canvas pixel size scaled by DPR for sharp text/vectors
      this.canvas.width = Math.floor(viewport.width * dpr);
      this.canvas.height = Math.floor(viewport.height * dpr);

      // CSS display size
      this.canvas.style.width = `${Math.floor(viewport.width)}px`;
      this.canvas.style.height = `${Math.floor(viewport.height)}px`;

      const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null;

      const renderContext = {
        canvasContext: this.ctx,
        viewport,
        transform
      };

      this.activeRenderTask = page.render(renderContext);
      await this.activeRenderTask.promise;
      this.activeRenderTask = null;
    } catch (err) {
      if (err?.name !== 'RenderingCancelledException') {
        console.error('[KioskPreview] Page render error:', err);
      }
    }
  }

  /**
   * Renders customer image on canvas applying rotation and zoom factor.
   */
  renderImage() {
    if (!this.docModel?.imgElement) return;

    const img = this.docModel.imgElement;
    const rot = this.imageTransform.rotationDeg;
    const isSideways = rot === 90 || rot === 270;

    const baseWidth = isSideways ? img.naturalHeight : img.naturalWidth;
    const baseHeight = isSideways ? img.naturalWidth : img.naturalHeight;

    const displayWidth = baseWidth * this.currentScale;
    const displayHeight = baseHeight * this.currentScale;

    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(displayWidth * dpr);
    this.canvas.height = Math.floor(displayHeight * dpr);
    this.canvas.style.width = `${Math.floor(displayWidth)}px`;
    this.canvas.style.height = `${Math.floor(displayHeight)}px`;

    this.ctx.save();
    this.ctx.scale(dpr, dpr);
    this.ctx.clearRect(0, 0, displayWidth, displayHeight);

    // Translate to center for rotation
    this.ctx.translate(displayWidth / 2, displayHeight / 2);
    this.ctx.rotate((rot * Math.PI) / 180);

    const drawW = img.naturalWidth * this.currentScale;
    const drawH = img.naturalHeight * this.currentScale;

    this.ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    this.ctx.restore();

    this.onTransformChange(this.getTransformSnapshot());
  }

  /**
   * Rotates image 90 degrees clockwise.
   */
  rotateImage90() {
    this.imageTransform.rotationDeg = (this.imageTransform.rotationDeg + 90) % 360;
    this.renderImage();
  }

  /**
   * Resets transformations to zero.
   * @param {boolean} [reRender=true]
   */
  resetImageTransform(reRender = true) {
    this.imageTransform = {
      rotationDeg: 0,
      scale: 1.0,
      offsetX: 0,
      offsetY: 0
    };
    if (reRender && this.docModel?.fileType === 'IMAGE') {
      this.renderImage();
    }
  }

  /**
   * Exports an authoritative transform snapshot for backend print job compilation.
   * @returns {Object}
   */
  getTransformSnapshot() {
    return {
      fileType: this.docModel?.fileType || 'UNKNOWN',
      rotationDeg: this.imageTransform.rotationDeg,
      activePage: this.currentPage,
      totalPages: this.totalPages
    };
  }
}
