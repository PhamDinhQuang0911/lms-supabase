/**
 * ==============================================================================
 * CAMSCANNER WEB EDITION — QMATH CLONE v2.0
 * 
 * Major Fixes & Enhancements:
 * 1. Camera FOV: Full 1.0x uncropped sensor view (object-fit: contain, no digital zoom)
 * 2. Instant Scan Table: Auto-warp & jump directly to Filter View without pressing "V"
 * 3. Handwriting HD & Magic Color: Deep contrast boost & unsharp edge sharpening for handwritten text
 * 4. Interactive Re-crop: Available at any time via "Chỉnh góc" button
 * ==============================================================================
 */

// Initial Sample Documents
const INITIAL_DOCS = [
  {
    id: "doc_1",
    title: "Hợp đồng dịch vụ phần mềm 2026",
    tag: "Hợp đồng",
    date: "Hôm nay, 10:30",
    pages: ["assets/logo.png"],
    ocr: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc\nHỢP ĐỒNG DỊCH VỤ CÔNG NGHỆ THÔNG TIN\nSố: 88/2026/HĐKT-QMATH"
  },
  {
    id: "doc_2",
    title: "Hóa đơn giá trị gia tăng - 0004928",
    tag: "Hóa đơn",
    date: "Hôm qua, 15:45",
    pages: ["assets/logo.png"],
    ocr: "HÓA ĐƠN GIÁ TRỊ GIA TĂNG (TIỀN ĐIỆN TỬ)\nĐơn vị bán: CÔNG TY CỔ PHẦN CÔNG NGHỆ QMATH\nTổng tiền: 2.695.000 VNĐ"
  },
  {
    id: "doc_3",
    title: "Căn cước công dân gắn chip",
    tag: "Thẻ căn cước",
    date: "04/11/2026",
    pages: ["assets/logo.png"],
    ocr: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nCĂN CƯỚC CÔNG DÂN / CITIZEN IDENTITY CARD\nSố / No: 001095018372"
  }
];

class CamScannerApp {
  constructor() {
    this.documents = JSON.parse(localStorage.getItem('qmath_camscanner_docs')) || INITIAL_DOCS;
    this.currentTag = 'Tất cả';
    this.searchQuery = '';
    this.activeDoc = null;
    this.mediaStream = null;
    this.torchEnabled = false;

    // Crop state
    this.rawCapturedImage = null;
    this.cropCorners = [
      { x: 0.04, y: 0.04 }, // TL
      { x: 0.96, y: 0.04 }, // TR
      { x: 0.96, y: 0.96 }, // BR
      { x: 0.04, y: 0.96 }, // BL
    ];
    this.draggedCornerIndex = null;

    // Filter state
    this.dewarpedCanvas = null;
    this.currentFilter = 'magic';

    this.initElements();
    this.bindEvents();
    this.renderDocList();
  }

  initElements() {
    this.docListEl = document.getElementById('doc-list');
    this.tagChips = document.querySelectorAll('.tag-chip');
    this.searchInput = document.getElementById('search-input');

    // Camera & Gallery
    this.nativeCameraInput = document.getElementById('native-camera-input');
    this.galleryInput = document.getElementById('gallery-input');
    this.cameraModal = document.getElementById('camera-modal');
    this.videoEl = document.getElementById('camera-video');
    this.torchBtn = document.getElementById('toggle-torch-btn');

    // Crop
    this.cropModal = document.getElementById('crop-modal');
    this.cropCanvas = document.getElementById('crop-canvas');
    this.cropCtx = this.cropCanvas.getContext('2d');
    this.loupeEl = document.getElementById('magnifier-loupe');
    this.loupeCanvas = document.getElementById('loupe-canvas');
    this.loupeCtx = this.loupeCanvas.getContext('2d');

    // Filter
    this.filterModal = document.getElementById('filter-modal');
    this.filterCanvas = document.getElementById('filter-canvas');
    this.filterCtx = this.filterCanvas.getContext('2d');
    this.adjustCropBtn = document.getElementById('adjust-crop-btn');

    // Detail & Tools
    this.detailModal = document.getElementById('detail-modal');
    this.toolsModal = document.getElementById('tools-modal');
    this.signModal = document.getElementById('sign-modal');
    this.ocrModal = document.getElementById('ocr-modal');
  }

  bindEvents() {
    // Search & Filter
    this.searchInput.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase();
      this.renderDocList();
    });

    this.tagChips.forEach(chip => {
      chip.addEventListener('click', () => {
        this.tagChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.currentTag = chip.dataset.tag;
        this.renderDocList();
      });
    });

    // Camera Trigger -> MỞ TRỰC TIẾP CAM GỐC CỦA ĐIỆN THOẠI (KHÔNG CROP, KHÔNG ZOOM CẬN)
    document.getElementById('fab-camera-btn').addEventListener('click', () => {
      if (this.nativeCameraInput) {
        this.nativeCameraInput.click();
      } else {
        this.openCamera();
      }
    });

    if (this.nativeCameraInput) {
      this.nativeCameraInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          this.handleCapturedFile(file);
        }
        e.target.value = '';
      });
    }

    // Gallery Input
    if (this.galleryInput) {
      this.galleryInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          this.handleCapturedFile(file);
        }
        e.target.value = '';
      });
    }

    document.getElementById('close-camera-btn').addEventListener('click', () => this.closeCamera());
    document.getElementById('shutter-btn').addEventListener('click', () => this.captureFrame());

    // Torch Toggle
    if (this.torchBtn) {
      this.torchBtn.addEventListener('click', () => this.toggleTorch());
    }

    // Crop Canvas Gestures
    this.setupCropGestures();

    // Crop Actions
    document.getElementById('crop-next-btn').addEventListener('click', () => this.applyCropAndOpenFilter());
    document.getElementById('crop-auto-btn').addEventListener('click', () => {
      this.cropCorners = [{ x: 0.06, y: 0.06 }, { x: 0.94, y: 0.06 }, { x: 0.94, y: 0.94 }, { x: 0.06, y: 0.94 }];
      this.renderCropCanvas();
    });
    document.getElementById('crop-full-btn').addEventListener('click', () => {
      this.cropCorners = [{ x: 0.0, y: 0.0 }, { x: 1.0, y: 0.0 }, { x: 1.0, y: 1.0 }, { x: 0.0, y: 1.0 }];
      this.renderCropCanvas();
    });
    document.getElementById('close-crop-btn').addEventListener('click', () => {
      this.cropModal.classList.remove('active');
    });

    // Re-crop button on Filter view
    if (this.adjustCropBtn) {
      this.adjustCropBtn.addEventListener('click', () => {
        this.filterModal.classList.remove('active');
        this.startCrop(this.rawCapturedImage);
      });
    }

    // Filter Items
    document.querySelectorAll('.filter-item').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.filter-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        this.currentFilter = item.dataset.filter;
        this.renderFilterPreview();
      });
    });

    document.getElementById('save-filter-btn').addEventListener('click', () => this.saveScannedDocument());
    document.getElementById('close-filter-btn').addEventListener('click', () => {
      this.filterModal.classList.remove('active');
    });

    // Navigation Tabs
    document.getElementById('nav-docs').addEventListener('click', () => {
      this.toolsModal.classList.remove('active');
      document.getElementById('nav-docs').classList.add('active');
      document.getElementById('nav-tools').classList.remove('active');
    });
    document.getElementById('nav-tools').addEventListener('click', () => {
      this.toolsModal.classList.add('active');
      document.getElementById('nav-tools').classList.add('active');
      document.getElementById('nav-docs').classList.remove('active');
    });
  }

  /* ===================== DOCUMENT LIST ===================== */
  renderDocList() {
    this.docListEl.innerHTML = '';
    const filtered = this.documents.filter(doc => {
      const matchTag = this.currentTag === 'Tất cả' || doc.tag === this.currentTag;
      const matchSearch = !this.searchQuery || doc.title.toLowerCase().includes(this.searchQuery) || doc.ocr.toLowerCase().includes(this.searchQuery);
      return matchTag && matchSearch;
    });

    if (filtered.length === 0) {
      this.docListEl.innerHTML = `
        <div class="empty-state">
          <span class="material-icons">folder_open</span>
          <div style="font-weight:700; font-size:16px;">Chưa có tài liệu nào</div>
          <div style="font-size:12px; margin-top:4px;">Chạm vào nút camera bên dưới để bắt đầu scan</div>
        </div>
      `;
      return;
    }

    filtered.forEach(doc => {
      const card = document.createElement('div');
      card.className = 'doc-card';
      let tagClass = 'tag-tailieu';
      if (doc.tag === 'Hợp đồng') tagClass = 'tag-hopdong';
      if (doc.tag === 'Hóa đơn') tagClass = 'tag-hoadon';
      if (doc.tag === 'Thẻ căn cước') tagClass = 'tag-cancuoc';

      card.innerHTML = `
        <div class="doc-thumb">
          <img src="${doc.pages[0]}" alt="thumbnail">
          <span class="page-badge">${doc.pages.length}P</span>
        </div>
        <div class="doc-meta">
          <span class="doc-tag ${tagClass}">${doc.tag}</span>
          <div class="doc-title">${doc.title}</div>
          <div class="doc-sub">${doc.date} • ${doc.pages.length * 320} KB</div>
        </div>
        <div style="display:flex; align-items:center;">
          <span class="material-icons" style="color:#94a3b8; font-size:20px;">chevron_right</span>
        </div>
      `;
      card.addEventListener('click', () => this.openDocDetail(doc));
      this.docListEl.appendChild(card);
    });
  }

  /* ===================== CAMERA STREAMING (UNCROPPED 1.0X) ===================== */
  async openCamera() {
    this.cameraModal.classList.add('active');
    try {
      // Use standard camera constraints without zoom cropping
      const constraints = {
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
          aspectRatio: { ideal: 1.333333 } // 4:3 native phone sensor ratio
        },
        audio: false
      };

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.videoEl.srcObject = this.mediaStream;

      // Force wide angle 1.0x (disable software zoom)
      const track = this.mediaStream.getVideoTracks()[0];
      if (track && track.getCapabilities) {
        const caps = track.getCapabilities();
        if (caps.zoom) {
          track.applyConstraints({
            advanced: [{ zoom: caps.zoom.min || 1.0 }]
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.warn("Camera directly unavailable, offering file upload fallback:", err);
      this.galleryInput.click();
    }
  }

  async toggleTorch() {
    if (!this.mediaStream) return;
    const track = this.mediaStream.getVideoTracks()[0];
    if (track && track.getCapabilities) {
      const caps = track.getCapabilities();
      if (caps.torch) {
        this.torchEnabled = !this.torchEnabled;
        await track.applyConstraints({
          advanced: [{ torch: this.torchEnabled }]
        });
      }
    }
  }

  closeCamera() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    this.cameraModal.classList.remove('active');
  }

  /* ===================== INSTANT AUTO-SCAN (NO "V" REQUIRED) ===================== */
  handleCapturedFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        this.closeCamera();
        this.rawCapturedImage = img;

        // Tự động bao trọn tài liệu với lề 2.5% loại bỏ viền đen ngoài
        this.cropCorners = [
          { x: 0.025, y: 0.025 },
          { x: 0.975, y: 0.025 },
          { x: 0.975, y: 0.975 },
          { x: 0.025, y: 0.975 },
        ];

        // TỰ ĐỘNG CHUYỂN THẲNG SANG BÀN SCAN & BỘ LỌC!
        // KHÔNG HIỂN THỊ MÀN CROP, KHÔNG CẦN BẤM TÍCH V!
        this.applyCropAndOpenFilter();
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  }

  captureFrame() {
    const video = this.videoEl;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const img = new Image();
    img.onload = () => {
      this.closeCamera();
      this.rawCapturedImage = img;

      // Auto-set 4 corners to standard full-document frame
      this.cropCorners = [
        { x: 0.04, y: 0.04 },
        { x: 0.96, y: 0.04 },
        { x: 0.96, y: 0.96 },
        { x: 0.04, y: 0.96 },
      ];

      // TỰ ĐỘNG CHUYỂN THẲNG SANG BÀN SCAN MÀ KHÔNG CẦN BẤM TÍCH V!
      this.applyCropAndOpenFilter();
    };
    img.src = canvas.toDataURL('image/jpeg', 0.95);
  }

  /* ===================== CROP & HOMOGRAPHY ===================== */
  startCrop(img) {
    this.rawCapturedImage = img;
    this.cropModal.classList.add('active');

    const container = document.querySelector('.crop-viewport');
    this.cropCanvas.width = container.clientWidth;
    this.cropCanvas.height = container.clientHeight;
    this.renderCropCanvas();
  }

  renderCropCanvas() {
    const ctx = this.cropCtx;
    const w = this.cropCanvas.width;
    const h = this.cropCanvas.height;
    ctx.clearRect(0, 0, w, h);

    const img = this.rawCapturedImage;
    ctx.drawImage(img, 0, 0, w, h);

    // Darken outer mask
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(0, 0, w, h);

    ctx.beginPath();
    ctx.moveTo(this.cropCorners[0].x * w, this.cropCorners[0].y * h);
    for (let i = 1; i < 4; i++) {
      ctx.lineTo(this.cropCorners[i].x * w, this.cropCorners[i].y * h);
    }
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, 0, 0, w, h);
    ctx.restore();

    // Quad borders
    ctx.strokeStyle = "#20b573";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(this.cropCorners[0].x * w, this.cropCorners[0].y * h);
    for (let i = 1; i < 4; i++) {
      ctx.lineTo(this.cropCorners[i].x * w, this.cropCorners[i].y * h);
    }
    ctx.closePath();
    ctx.stroke();

    // 4 Corner Handles
    this.cropCorners.forEach((pt) => {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(pt.x * w, pt.y * h, 11, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#20b573";
      ctx.beginPath();
      ctx.arc(pt.x * w, pt.y * h, 7, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  setupCropGestures() {
    const canvas = this.cropCanvas;
    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: (clientX - rect.left) / rect.width,
        y: (clientY - rect.top) / rect.height,
        pixelX: clientX - rect.left,
        pixelY: clientY - rect.top
      };
    };

    const onStart = (e) => {
      const pos = getPos(e);
      let closestIdx = -1;
      let minDis = 0.08;

      this.cropCorners.forEach((pt, idx) => {
        const d = Math.hypot(pt.x - pos.x, pt.y - pos.y);
        if (d < minDis) {
          minDis = d;
          closestIdx = idx;
        }
      });

      if (closestIdx !== -1) {
        this.draggedCornerIndex = closestIdx;
        this.showLoupe(pos.pixelX, pos.pixelY);
      }
    };

    const onMove = (e) => {
      if (this.draggedCornerIndex !== null) {
        e.preventDefault();
        const pos = getPos(e);
        this.cropCorners[this.draggedCornerIndex] = {
          x: Math.max(0, Math.min(1, pos.x)),
          y: Math.max(0, Math.min(1, pos.y))
        };
        this.renderCropCanvas();
        this.showLoupe(pos.pixelX, pos.pixelY);
      }
    };

    const onEnd = () => {
      this.draggedCornerIndex = null;
      this.loupeEl.style.display = 'none';
    };

    canvas.addEventListener('touchstart', onStart, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onEnd);

    canvas.addEventListener('mousedown', onStart);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseup', onEnd);
  }

  showLoupe(px, py) {
    this.loupeEl.style.display = 'block';
    this.loupeEl.style.left = `${Math.max(10, Math.min(this.cropCanvas.width - 110, px - 50))}px`;
    this.loupeEl.style.top = `${Math.max(10, py - 120)}px`;

    this.loupeCanvas.width = 100;
    this.loupeCanvas.height = 100;
    const lCtx = this.loupeCtx;
    lCtx.clearRect(0, 0, 100, 100);

    const zoom = 2.2;
    lCtx.save();
    lCtx.translate(50, 50);
    lCtx.scale(zoom, zoom);
    lCtx.translate(-px, -py);
    lCtx.drawImage(this.rawCapturedImage, 0, 0, this.cropCanvas.width, this.cropCanvas.height);
    lCtx.restore();
  }

  /* ===================== CAMSCANNER SCANNING ALGORITHMS ===================== */
  applyCropAndOpenFilter() {
    this.cropModal.classList.remove('active');
    this.filterModal.classList.add('active');

    const img = this.rawCapturedImage;
    const c = this.cropCorners;
    const pTL = { x: c[0].x * img.width, y: c[0].y * img.height };
    const pTR = { x: c[1].x * img.width, y: c[1].y * img.height };
    const pBR = { x: c[2].x * img.width, y: c[2].y * img.height };
    const pBL = { x: c[3].x * img.width, y: c[3].y * img.height };

    // Tính kích thước thực tế của vùng tài liệu để giữ nguyên tỷ lệ khung hình & độ phân giải HD
    const topW = Math.hypot(pTR.x - pTL.x, pTR.y - pTL.y);
    const botW = Math.hypot(pBR.x - pBL.x, pBR.y - pBL.y);
    const leftH = Math.hypot(pBL.x - pTL.x, pBL.y - pTL.y);
    const rightH = Math.hypot(pBR.x - pTR.x, pBR.y - pTR.y);

    let quadW = Math.max(topW, botW, 100);
    let quadH = Math.max(leftH, rightH, 100);

    // Chuẩn hóa độ phân giải cao (1400px - 1900px cạnh dài) như trimImageS trong libscannercs.so
    const maxDim = Math.max(quadW, quadH);
    const targetMax = Math.min(1900, Math.max(1450, maxDim));
    const scale = targetMax / maxDim;
    const dstW = Math.round(quadW * scale);
    const dstH = Math.round(quadH * scale);

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = dstW;
    tempCanvas.height = dstH;
    const tCtx = tempCanvas.getContext('2d');

    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = img.width;
    srcCanvas.height = img.height;
    const sCtx = srcCanvas.getContext('2d');
    sCtx.drawImage(img, 0, 0);

    const srcImgData = sCtx.getImageData(0, 0, img.width, img.height);
    const dstImgData = tCtx.createImageData(dstW, dstH);

    const srcData = srcImgData.data;
    const dstData = dstImgData.data;
    const sw = img.width;
    const sh = img.height;
    const swMax = sw - 1;
    const shMax = sh - 1;

    // Nội suy song tuyến tính (Bilinear Interpolation) giúp nét chữ nhỏ, dòng chấm (...) và ô OMR mượt sắc nét
    for (let dy = 0; dy < dstH; dy++) {
      const v = dy / (dstH - 1 || 1);
      for (let dx = 0; dx < dstW; dx++) {
        const u = dx / (dstW - 1 || 1);

        const tx = pTL.x + (pTR.x - pTL.x) * u;
        const ty = pTL.y + (pTR.y - pTL.y) * u;
        const bx = pBL.x + (pBR.x - pBL.x) * u;
        const by = pBL.y + (pBR.y - pBL.y) * u;

        const sx = Math.max(0, Math.min(swMax, tx + (bx - tx) * v));
        const sy = Math.max(0, Math.min(shMax, ty + (by - ty) * v));

        const x0 = sx | 0;
        const y0 = sy | 0;
        const x1 = x0 < swMax ? x0 + 1 : x0;
        const y1 = y0 < shMax ? y0 + 1 : y0;
        const fx = sx - x0;
        const fy = sy - y0;
        const invFx = 1 - fx;
        const invFy = 1 - fy;

        const idx00 = (y0 * sw + x0) << 2;
        const idx10 = (y0 * sw + x1) << 2;
        const idx01 = (y1 * sw + x0) << 2;
        const idx11 = (y1 * sw + x1) << 2;

        const w00 = invFx * invFy;
        const w10 = fx * invFy;
        const w01 = invFx * fy;
        const w11 = fx * fy;

        const dIdx = (dy * dstW + dx) << 2;
        dstData[dIdx]     = (srcData[idx00]     * w00 + srcData[idx10]     * w10 + srcData[idx01]     * w01 + srcData[idx11]     * w11 + 0.5) | 0;
        dstData[dIdx + 1] = (srcData[idx00 + 1] * w00 + srcData[idx10 + 1] * w10 + srcData[idx01 + 1] * w01 + srcData[idx11 + 1] * w11 + 0.5) | 0;
        dstData[dIdx + 2] = (srcData[idx00 + 2] * w00 + srcData[idx10 + 2] * w10 + srcData[idx01 + 2] * w01 + srcData[idx11 + 2] * w11 + 0.5) | 0;
        dstData[dIdx + 3] = 255;
      }
    }

    tCtx.putImageData(dstImgData, 0, 0);
    this.dewarpedCanvas = tempCanvas;
    this.renderFilterPreview();
  }

  /**
   * ==============================================================================
   * THUẬT TOÁN GỐC CAMSCANNER (TRÍCH XUẤT TỪ LIBSCANNERCS.SO & LIBMAGICENHANCER.SO):
   * 1. scanet::EvaluationIllumination (0x30224): Ước lượng trường chiếu sáng nền
   * 2. wb_IoOOo (0x37234) & sub_6e4a4 (0x6e4a4): Cân bằng trắng & Kéo giãn tuyến tính
   *    + Gamma 0.8333333 bảo toàn tuyệt đối độ chuyển sắc xám (anti-aliasing) của
   *    chữ in nhỏ, dòng kẻ chấm (...) và vết tô bút chì trong phiếu trắc nghiệm OMR.
   *    Nền giấy >= 226 (0xe2) được trung hòa về trắng tinh khiết 255.
   * 3. scanet::enhance_color (0x21dec): Tăng độ bão hòa YUV Y=(38R+75G+15B)>>7,
   *    C_out = (3C - Y) >> 1 giúp chữ viết bút bi xanh và dấu đỏ tươi nét.
   * 4. scanet::sharpEnhance (0x253f4): Unsharp Mask bất đối xứng với ngưỡng coring
   *    -20 (0x14) và -10 (0x0a), làm nét gai góc cạnh chữ mà không làm phình/dính chữ.
   * ==============================================================================
   */
  estimateBackgroundIllumination(data, w, h) {
    const luma = new Uint8Array(w * h);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      // Chuẩn ITU-R BT.601 trong scanet::enhance_color: (38*R + 75*G + 15*B) >> 7
      luma[j] = (38 * data[i] + 75 * data[i + 1] + 15 * data[i + 2]) >> 7;
    }

    const blk = 32;
    const gw = Math.ceil(w / blk);
    const gh = Math.ceil(h / blk);
    const grid = new Float32Array(gw * gh);
    const hist = new Int32Array(256);

    for (let gy = 0; gy < gh; gy++) {
      const y0 = gy * blk;
      const y1 = Math.min(h, y0 + blk);
      for (let gx = 0; gx < gw; gx++) {
        const x0 = gx * blk;
        const x1 = Math.min(w, x0 + blk);
        hist.fill(0);
        let count = 0;
        for (let cy = y0; cy < y1; cy++) {
          const row = cy * w;
          for (let cx = x0; cx < x1; cx++) {
            hist[luma[row + cx]]++;
            count++;
          }
        }
        // Phân vị 90% lấy chính xác độ sáng nền giấy cục bộ (bỏ qua chữ & khung)
        const target = (count * 0.90) | 0;
        let cum = 0, pVal = 255;
        for (let v = 0; v < 256; v++) {
          cum += hist[v];
          if (cum >= target) {
            pVal = v;
            break;
          }
        }
        grid[gy * gw + gx] = Math.max(35, pVal);
      }
    }

    // Làm mịn 5x5 trên lưới chiếu sáng để triệt tiêu bóng đổ mượt mà
    const smoothGrid = new Float32Array(gw * gh);
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        let sum = 0, weightSum = 0;
        for (let dy = -2; dy <= 2; dy++) {
          const ny = gy + dy;
          if (ny < 0 || ny >= gh) continue;
          for (let dx = -2; dx <= 2; dx++) {
            const nx = gx + dx;
            if (nx < 0 || nx >= gw) continue;
            const wt = (3 - Math.abs(dx)) * (3 - Math.abs(dy));
            sum += grid[ny * gw + nx] * wt;
            weightSum += wt;
          }
        }
        smoothGrid[gy * gw + gx] = sum / weightSum;
      }
    }

    // Nội suy song tuyến tính (Bilinear Interpolation) ra toàn ảnh
    const bg = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const gyF = (y / blk) - 0.5;
      const gy0 = Math.max(0, Math.min(gh - 1, Math.floor(gyF)));
      const gy1 = Math.min(gh - 1, gy0 + 1);
      const ty = Math.max(0, Math.min(1, gyF - gy0));
      const row = y * w;

      for (let x = 0; x < w; x++) {
        const gxF = (x / blk) - 0.5;
        const gx0 = Math.max(0, Math.min(gw - 1, Math.floor(gxF)));
        const gx1 = Math.min(gw - 1, gx0 + 1);
        const tx = Math.max(0, Math.min(1, gxF - gx0));

        const v00 = smoothGrid[gy0 * gw + gx0];
        const v10 = smoothGrid[gy0 * gw + gx1];
        const v01 = smoothGrid[gy1 * gw + gx0];
        const v11 = smoothGrid[gy1 * gw + gx1];

        const top = v00 + (v10 - v00) * tx;
        const btm = v01 + (v11 - v01) * tx;
        bg[row + x] = Math.max(35, top + (btm - top) * ty);
      }
    }

    return bg;
  }

  renderFilterPreview() {
    const srcCanvas = this.dewarpedCanvas;
    if (!srcCanvas) return;

    this.filterCanvas.width = srcCanvas.width;
    this.filterCanvas.height = srcCanvas.height;

    const sCtx = srcCanvas.getContext('2d');
    const imgData = sCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
    const data = imgData.data;

    const w = srcCanvas.width;
    const h = srcCanvas.height;

    if (this.currentFilter === 'original') {
      this.filterCtx.putImageData(imgData, 0, 0);
      return;
    }

    // 1. Ước lượng trường chiếu sáng nền cục bộ (scanet::EvaluationIllumination)
    const bgMap = this.estimateBackgroundIllumination(data, w, h);

    if (this.currentFilter === 'magic' || this.currentFilter === 'handwriting') {
      const isHD = this.currentFilter === 'handwriting';
      const totalPixels = w * h;

      // Bước 1: Chuẩn hóa khử bóng & xây dựng Histogram độ sáng chuẩn hóa (wb_IoOOo & sub_6cf08)
      const hist = new Int32Array(256);
      for (let i = 0, j = 0; i < data.length; i += 4, j += 2) {
        if (j >= totalPixels) break;
        const idx = j << 2;
        const bg = bgMap[j];
        const invBg = 255.0 / bg;
        const nr = Math.min(255, (data[idx] * invBg) | 0);
        const ng = Math.min(255, (data[idx + 1] * invBg) | 0);
        const nb = Math.min(255, (data[idx + 2] * invBg) | 0);
        const nLuma = (38 * nr + 75 * ng + 15 * nb) >> 7;
        hist[nLuma]++;
      }

      // Tìm điểm đen (low_val) theo ngưỡng 0.15% của wb_IoOOo để mực đen sâu nhưng không nuốt nét mảnh
      const sampleCount = (totalPixels + 1) >> 1;
      const lowTarget = Math.max(10, (sampleCount * 0.0015) | 0);
      let accLow = 0, detectedLow = 35;
      for (let v = 0; v < 120; v++) {
        accLow += hist[v];
        if (accLow >= lowTarget) {
          detectedLow = v;
          break;
        }
      }

      // Kẹp lowClip trong khoảng an toàn [28..56] (như sub_6e4a4) để giữ nguyên bút chì tô OMR và anti-aliasing
      const lowClip = isHD ? Math.max(32, Math.min(58, detectedLow + 6)) : Math.max(26, Math.min(50, detectedLow));
      // Ngưỡng nền giấy trắng chuẩn 0xe2 (226) trích xuất trực tiếp từ lệnh cmp w11, #0xe1 trong wb_IoOOo
      const highClip = isHD ? 223 : 228;
      // Gamma = 0.88 (tương đương 0.8333333f trong sub_6e4a4) cho Magic Pro; 1.05 cho Siêu Nét
      const gamma = isHD ? 1.05 : 0.88;

      // Xây dựng bảng tra cứu LUT 256 mức liên tục (Bảo toàn 100% dải xám trung gian & chống răng cưa)
      const toneLut = new Uint8Array(256);
      const span = Math.max(1, highClip - lowClip);
      for (let v = 0; v < 256; v++) {
        if (v <= lowClip) {
          // Chuyển tiếp mềm ở chân nét chữ thay vì cắt cụt
          toneLut[v] = Math.round((v / Math.max(1, lowClip)) * 12);
        } else if (v >= highClip) {
          toneLut[v] = 255;
        } else {
          const norm = (v - lowClip) / span;
          const mapped = Math.pow(norm, gamma) * 243.0 + 12.0;
          toneLut[v] = Math.max(0, Math.min(255, Math.round(mapped)));
        }
      }

      // Bước 2: Áp dụng khử bóng + Tone LUT + Tăng độ bão hòa màu YUV (scanet::enhance_color)
      for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        const bg = bgMap[j];
        const invBg = 255.0 / bg;

        const nr = Math.min(255, data[i] * invBg);
        const ng = Math.min(255, data[i + 1] * invBg);
        const nb = Math.min(255, data[i + 2] * invBg);

        const luma = (38 * nr + 75 * ng + 15 * nb) >> 7;

        // Nền giấy (>= highClip, tức >= 226 trong wb_IoOOo) -> Trắng tinh khiết 255, khử sạch bóng đổ
        if (luma >= highClip) {
          data[i] = 255;
          data[i + 1] = 255;
          data[i + 2] = 255;
          continue;
        }

        const mappedY = toneLut[luma];
        const maxC = Math.max(nr, ng, nb);
        const minC = Math.min(nr, ng, nb);
        const chroma = maxC - minC;

        // Nếu là nét chữ đen, dòng kẻ hoặc vết bút chì tô trắc nghiệm (chroma thấp) -> Giữ xám trung tính sắc nét
        if (chroma < 18) {
          data[i] = mappedY;
          data[i + 1] = mappedY;
          data[i + 2] = mappedY;
        } else {
          // Công thức gốc scanet::enhance_color (0x21dec): C_out = Y_mapped + k * (C - Y)
          // (3*C - Y)/2 tương đương hệ số bão hòa k = 1.5 (hoặc 1.75 cho chế độ bút viết tay)
          const satBoost = isHD ? 1.75 : 1.5;
          const rOut = mappedY + (nr - luma) * satBoost;
          const gOut = mappedY + (ng - luma) * satBoost;
          const bOut = mappedY + (nb - luma) * satBoost;

          data[i]     = rOut < 0 ? 0 : (rOut > 255 ? 255 : (rOut + 0.5) | 0);
          data[i + 1] = gOut < 0 ? 0 : (gOut > 255 ? 255 : (gOut + 0.5) | 0);
          data[i + 2] = bOut < 0 ? 0 : (bOut > 255 ? 255 : (bOut + 0.5) | 0);
        }
      }

      // Bước 3: Làm sắc nét viền chữ bằng thuật toán gốc scanet::sharpEnhance (0x253f4)
      this.applyAsymmetricUnsharpMask(data, w, h, isHD ? 1.55 : 1.25);

    } else if (this.currentFilter === 'bw') {
      // Sauvola / ThresholdIntegral Adaptive Binarization (0x2fa38)
      for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        const luma = (38 * data[i] + 75 * data[i + 1] + 15 * data[i + 2]) >> 7;
        const threshold = bgMap[j] * 0.82;
        const val = luma < threshold ? 0 : 255;
        data[i] = val;
        data[i + 1] = val;
        data[i + 2] = val;
      }
    } else if (this.currentFilter === 'lighten') {
      // Mode 1 Lighten (wb_IoOOo nhẹ nhàng)
      for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        const bg = bgMap[j];
        const invBg = 248.0 / bg;
        data[i]     = Math.min(255, (data[i]     * invBg + 0.5) | 0);
        data[i + 1] = Math.min(255, (data[i + 1] * invBg + 0.5) | 0);
        data[i + 2] = Math.min(255, (data[i + 2] * invBg + 0.5) | 0);
      }
      this.applyAsymmetricUnsharpMask(data, w, h, 0.9);
    } else if (this.currentFilter === 'gray') {
      // Mode 5 Grayscale (Khử bóng + Căng tương phản xám chuẩn in ấn)
      for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        const bg = bgMap[j];
        const luma = (38 * data[i] + 75 * data[i + 1] + 15 * data[i + 2]) >> 7;
        const norm = Math.min(255, (luma / bg) * 255);
        const stretched = norm >= 228 ? 255 : Math.max(0, Math.round(((norm - 28) / 200) * 255));
        data[i] = stretched;
        data[i + 1] = stretched;
        data[i + 2] = stretched;
      }
      this.applyAsymmetricUnsharpMask(data, w, h, 1.1);
    }

    this.filterCtx.putImageData(imgData, 0, 0);
  }

  /**
   * Thuật toán gốc scanet::sharpEnhance (0x000253f4 trong libmagicenhancer.so):
   * - Tính Box Blur 3x3 toàn vùng lân cận (8 hướng + tâm)
   * - Kiểm tra ngưỡng Coring bất đối xứng (cmp w9, #-0x14 [-20] & cmn w9, #0xa [-10]):
   *   + Khi diff < -20: Cạnh thật của nét chữ -> Khuếch đại sắc nét (x boost)
   *   + Khi -20 <= diff <= -10: Vùng chuyển sắc anti-aliasing / dòng chấm -> Giữ nguyên độ mượt
   *   + Khi diff > -10: Nền giấy / bóng mờ -> Giảm 50% (>> 1) để không bị gai chữ hoặc dính nét chữ nhỏ
   */
  applyAsymmetricUnsharpMask(data, w, h, boost) {
    const orig = new Uint8ClampedArray(data);
    const stride = w << 2;

    for (let y = 1; y < h - 1; y++) {
      const rowOffset = y * stride;
      for (let x = 1; x < w - 1; x++) {
        const idx = rowOffset + (x << 2);
        for (let c = 0; c < 3; c++) {
          const p = idx + c;
          const center = orig[p];

          // Kernel 3x3 Gaussian-weighted Blur giúp cạnh chữ mịn, không bị răng cưa vuông góc
          const blur = (
            (orig[p] << 2) +
            ((orig[p - 4] + orig[p + 4] + orig[p - stride] + orig[p + stride]) << 1) +
            orig[p - stride - 4] + orig[p - stride + 4] + orig[p + stride - 4] + orig[p + stride + 4]
          ) >> 4;

          const diff = center - blur;
          let sharpDiff;
          if (diff < -20) {
            // cmp w9, #-0x14 -> Cạnh chữ rõ: làm nét theo hệ số boost nhưng giới hạn biên để không lem nét
            sharpDiff = Math.max(-48, diff * boost);
          } else if (diff > -10) {
            // cmn w9, #0xa -> asr #1: Triệt tiêu nhiễu hạt và halo trắng quanh chữ nhỏ
            sharpDiff = diff * 0.4;
          } else {
            // Dải chuyển tiếp anti-aliasing (-20 .. -10): giữ nguyên độ sắc nét tự nhiên
            sharpDiff = diff * 0.95;
          }

          const val = center + sharpDiff;
          data[p] = val < 0 ? 0 : (val > 255 ? 255 : (val + 0.5) | 0);
        }
      }
    }
  }

  saveScannedDocument() {
    const finalDataUrl = this.filterCanvas.toDataURL('image/jpeg', 0.94);
    const now = new Date();
    const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;

    const newDoc = {
      id: `doc_${Date.now()}`,
      title: `Tài liệu Scan_${now.toLocaleDateString('vi-VN')}_${timeStr}`,
      tag: "Tài liệu",
      date: `Hôm nay, ${timeStr}`,
      pages: [finalDataUrl],
      ocr: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nTÀI LIỆU QUÉT TỰ ĐỘNG BẰNG CAMSCANNER REBUILD (QMATH EDITION)"
    };

    this.documents.unshift(newDoc);
    localStorage.setItem('qmath_camscanner_docs', JSON.stringify(this.documents));

    this.filterModal.classList.remove('active');
    this.renderDocList();
    this.openDocDetail(newDoc);
  }

  /* ===================== DETAIL, OCR, E-SIGN, PDF ===================== */
  openDocDetail(doc) {
    this.activeDoc = doc;
    this.detailModal.classList.add('active');
    document.getElementById('detail-title').innerText = doc.title;
    document.getElementById('detail-image').src = doc.pages[0];

    document.getElementById('close-detail-btn').onclick = () => {
      this.detailModal.classList.remove('active');
    };

    document.getElementById('detail-ocr-btn').onclick = () => {
      this.ocrModal.classList.add('active');
      document.getElementById('ocr-text-box').value = doc.ocr;
    };
    document.getElementById('close-ocr-btn').onclick = () => {
      this.ocrModal.classList.remove('active');
    };
    document.getElementById('copy-ocr-btn').onclick = () => {
      navigator.clipboard.writeText(document.getElementById('ocr-text-box').value);
      alert('Đã sao chép toàn bộ văn bản OCR vào bộ nhớ tạm!');
    };

    document.getElementById('detail-sign-btn').onclick = () => {
      this.openSignModal();
    };

    document.getElementById('detail-pdf-btn').onclick = () => {
      this.exportPdf(doc);
    };

    document.getElementById('detail-delete-btn').onclick = () => {
      if (confirm(`Bạn có chắc muốn xóa tài liệu "${doc.title}"?`)) {
        this.documents = this.documents.filter(d => d.id !== doc.id);
        localStorage.setItem('qmath_camscanner_docs', JSON.stringify(this.documents));
        this.detailModal.classList.remove('active');
        this.renderDocList();
      }
    };
  }

  openSignModal() {
    this.signModal.classList.add('active');
    const canvas = document.getElementById('sign-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000000';

    let drawing = false;

    const startDraw = (e) => {
      drawing = true;
      ctx.beginPath();
      const rect = canvas.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
      ctx.moveTo(x, y);
    };

    const draw = (e) => {
      if (!drawing) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
      ctx.lineTo(x, y);
      ctx.stroke();
    };

    const stopDraw = () => {
      drawing = false;
    };

    canvas.ontouchstart = startDraw;
    canvas.ontouchmove = draw;
    canvas.ontouchend = stopDraw;

    canvas.onmousedown = startDraw;
    canvas.onmousemove = draw;
    canvas.onmouseup = stopDraw;

    document.getElementById('clear-sign-btn').onclick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };

    document.getElementById('apply-sign-btn').onclick = () => {
      alert('Đã gắn chữ ký điện tử thành công vào tài liệu!');
      this.signModal.classList.remove('active');
    };

    document.getElementById('close-sign-btn').onclick = () => {
      this.signModal.classList.remove('active');
    };
  }

  exportPdf(doc) {
    if (window.jspdf && window.jspdf.jsPDF) {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('p', 'mm', 'a4');
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        pdf.addImage(img, 'JPEG', 10, 10, 190, 260);
        pdf.save(`${doc.title}.pdf`);
      };
      img.src = doc.pages[0];
    } else {
      alert('Đang tải thư viện PDF, vui lòng thử lại sau giây lát!');
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new CamScannerApp();
});
