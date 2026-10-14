/**
 * AURA PRINT PRO — CUSTOMER KIOSK UPLOAD & DOCUMENT PARSER
 * Owner: Sabir Ansari
 * 
 * Features:
 * - Drag-and-drop & native file input binding
 * - Client-side validation (100 MB limit, valid extensions, MIME checks)
 * - PDF.js document loader & exact page-count extraction
 * - Corrupted, password-protected, and invalid file detection
 * - Image file metadata extraction (JPG/PNG)
 */

import { validateUploadFile, MAX_FILE_SIZE_BYTES } from '/src/shared/validators.js';
import { formatBytes } from '/src/shared/formatters.js';

// Configure PDF.js worker if available on window
if (typeof window !== 'undefined' && window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

export class KioskUploadHandler {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.dropZoneElement
   * @param {HTMLInputElement} options.fileInputElement
   * @param {HTMLElement} options.processingElement
   * @param {HTMLElement} options.processingMsgElement
   * @param {Function} options.onFileValidated - Callback with parsed document model
   * @param {Function} options.onError - Callback with error string
   */
  constructor({
    dropZoneElement,
    fileInputElement,
    processingElement,
    processingMsgElement,
    onFileValidated,
    onError
  }) {
    this.dropZone = dropZoneElement;
    this.fileInput = fileInputElement;
    this.processingBox = processingElement;
    this.processingMsg = processingMsgElement;
    this.onFileValidated = onFileValidated;
    this.onError = onError;

    this.currentFile = null;
    this.bindEvents();
  }

  bindEvents() {
    if (!this.dropZone || !this.fileInput) return;

    // Trigger file dialog on dropzone click
    this.dropZone.addEventListener('click', () => {
      this.fileInput.click();
    });

    // Handle file selection from system picker
    this.fileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        this.processFile(file);
      }
    });

    // Drag and Drop listeners
    ['dragenter', 'dragover'].forEach(eventName => {
      this.dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.dropZone.classList.add('drag-active');
      });
    });

    ['dragleave', 'dragend'].forEach(eventName => {
      this.dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.dropZone.classList.remove('drag-active');
      });
    });

    this.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.dropZone.classList.remove('drag-active');

      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length > 0) {
        this.processFile(files[0]);
      }
    });

    // Accessibility keyboard support (Enter or Space)
    this.dropZone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.fileInput.click();
      }
    });
  }

  setLoadingState(isLoading, message = 'दस्तावेज़ की जांच हो रही है...') {
    if (!this.processingBox || !this.dropZone) return;

    if (isLoading) {
      this.dropZone.classList.add('hidden');
      this.processingBox.classList.remove('hidden');
      if (this.processingMsg) {
        this.processingMsg.textContent = message;
      }
    } else {
      this.processingBox.classList.add('hidden');
      this.dropZone.classList.remove('hidden');
    }
  }

  /**
   * Main entry point to validate and parse user-selected file.
   * @param {File} file 
   */
  async processFile(file) {
    this.onError(null); // Clear previous errors

    // 1. Shared validator check (size, extension, basic mime)
    const validation = validateUploadFile(file);
    if (!validation.isValid) {
      this.setLoadingState(false);
      this.onError(validation.error);
      this.resetInput();
      return;
    }

    this.currentFile = file;
    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';

    this.setLoadingState(true, isPdf ? 'PDF के कुल पेज गिने जा रहे हैं...' : 'फ़ोटो लोड हो रही है...');

    try {
      if (isPdf) {
        await this.handlePdfDocument(file);
      } else {
        await this.handleImageDocument(file);
      }
    } catch (err) {
      console.error('[KioskUpload] Document parse failure:', err);
      this.setLoadingState(false);
      this.resetInput();

      let friendlyMsg = 'फ़ाइल लोड करने में त्रुटि हुई। कृपया दूसरी वैध फ़ाइल चुनें।';
      if (err.name === 'PasswordException') {
        friendlyMsg = 'यह PDF पासवर्ड से सुरक्षित है। कृपया पासवर्ड हटाकर बिना लॉक वाली फ़ाइल अपलोड करें।';
      } else if (err.message && err.message.includes('Invalid PDF')) {
        friendlyMsg = 'यह PDF फ़ाइल करप्ट या अधूरी है। कृपया सही PDF चुनें।';
      }

      this.onError(friendlyMsg);
    }
  }

  /**
   * Reads PDF binary and queries PDF.js for verified page count.
   * @param {File} file 
   */
  async handlePdfDocument(file) {
    const arrayBuffer = await file.arrayBuffer();

    if (!window.pdfjsLib) {
      throw new Error('PDF.js library is not available in the current environment.');
    }

    // Load PDF via PDF.js loading task
    const loadingTask = window.pdfjsLib.getDocument({
      data: arrayBuffer,
      cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
      cMapPacked: true
    });

    const pdfDoc = await loadingTask.promise;
    const totalPages = pdfDoc.numPages;

    if (totalPages <= 0) {
      throw new Error('PDF document has zero valid pages.');
    }

    // Fetch initial page dimension ratio
    const firstPage = await pdfDoc.getPage(1);
    const viewport = firstPage.getViewport({ scale: 1.0 });

    const documentModel = {
      file,
      fileType: 'PDF',
      fileName: file.name,
      fileSize: file.size,
      formattedSize: formatBytes(file.size),
      totalPages,
      pdfDoc,
      aspectRatio: viewport.width / viewport.height,
      rawBuffer: arrayBuffer
    };

    this.setLoadingState(false);
    this.onFileValidated(documentModel);
  }

  /**
   * Reads JPG/PNG and constructs image metadata model.
   * @param {File} file 
   */
  handleImageDocument(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        const dataUrl = e.target.result;
        const img = new Image();

        img.onload = () => {
          const documentModel = {
            file,
            fileType: 'IMAGE',
            fileName: file.name,
            fileSize: file.size,
            formattedSize: formatBytes(file.size),
            totalPages: 1, // Images are strictly 1 logical page
            imgElement: img,
            dataUrl,
            width: img.naturalWidth,
            height: img.naturalHeight,
            aspectRatio: img.naturalWidth / img.naturalHeight
          };

          this.setLoadingState(false);
          this.onFileValidated(documentModel);
          resolve(documentModel);
        };

        img.onerror = () => {
          reject(new Error('Selected image file is corrupted or cannot be rendered.'));
        };

        img.src = dataUrl;
      };

      reader.onerror = () => {
        reject(new Error('Failed to read file from storage.'));
      };

      reader.readAsDataURL(file);
    });
  }

  resetInput() {
    if (this.fileInput) {
      this.fileInput.value = '';
    }
    this.currentFile = null;
  }
}
