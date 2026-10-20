/* ============================================================================
   FinGuard Main Application Controller
   ----------------------------------------------------------------------------
   Implements:
     - SPA Routing (/, /how-it-works, /features, /technology, /analyze, /analysis, /results)
     - Responsive Banking Navigation & Health Monitoring
     - Multi-Modal Form Handlers (Video, Audio, Image, Text, URL, APK)
     - Live analysis workspace & 18 rotating scam-awareness tips
     - Structured Result Presentation with Strict Modality Separation
   ========================================================================= */

import { $, $$, esc, fmtBytes, fmtClock, fmtScore, fmtStamp, reducedMotion } from './dom.js';
import { LIMITS, getJobComplaint, health, startRun, validateFile, validateText, validateUrl } from './api.js';
import { planFor } from './stages.js';
import { toViewModel } from './model.js';

/* ── Application State ───────────────────────────────────────────────────── */

const state = {
  route: getInitialRoute(),
  mode: 'video',
  file: null,
  previewUrl: null,
  text: '',
  urlText: '',
  run: null,
  startedAt: null,
  jobId: null,
  viewModel: null,
  tipIndex: 0,
  tipTimer: null,
  tipSwapTimeout: null,
  tipVisibilityHandler: null,
};

function getInitialRoute() {
  const path = window.location.pathname;
  const validRoutes = ['/', '/how-it-works', '/features', '/technology', '/analyze', '/analysis', '/results'];
  return validRoutes.includes(path) ? path : '/';
}

/* ── 18 Comprehensive Scam-Awareness Tips ────────────────────────────────── */

const SCAM_TIPS = [
  'Never share your OTP, even with someone claiming to be from your bank or regulatory authority.',
  'A promise of guaranteed high or fixed market returns is an immediate warning sign of investment fraud.',
  'Never transfer money to unlock a frozen investment withdrawal or pay an advance fee.',
  'Always check investment adviser claims through official SEBI sources at sebi.gov.in before investing.',
  'A familiar face or voice does not prove that a video or call is genuine. AI cloning is widely used by scammers.',
  'Never enter your UPI PIN to receive money. A PIN is required only when transferring funds out.',
  'Check website URLs carefully before entering financial details. Scammers create realistic lookalike domains.',
  'A genuine person can promote an unregistered scam, and AI-generated content can also be completely harmless.',
  'Legitimate investment advisers never ask for your Demat trading account password or authentication credentials.',
  'Be cautious of investment opportunities offered exclusively through private WhatsApp or Telegram groups.',
  'Government regulators and law enforcement agencies never demand instant funds transfers over the phone.',
  'High pressure to act immediately is one of the most common psychological tactics used in financial scams.',
  'Verify SEBI registration numbers on the official SEBI intermediary database before making commitments.',
  'Never install remote-access apps (such as AnyDesk or TeamViewer) at the request of an unknown caller.',
  'If an investment offer sounds too good to be true, pause and consult an independent registered professional.',
  'Deepfake audio can realistically mimic family members, corporate executives, or famous market commentators.',
  'Real stock exchanges and depositories never hold investor funds in personal savings accounts.',
  'Report financial cyber fraud immediately to the National Cyber Crime Portal at cybercrime.gov.in or helpline 1930.',
];

const STAGE_ACTIVITY = {
  stage1_ingest: 'Securing the media and preparing its audio and frames.',
  stage2_vision: 'Checking face regions for signs of visual manipulation.',
  stage4_transcription: 'Transcribing speech and aligning the spoken segments.',
  stage3_audio: 'Checking audio patterns for signs of synthetic speech.',
  stage7_ocr: 'Reading on-screen text for claims and identifiers.',
  stage5_llm: 'Reviewing financial claims and pressure tactics.',
  stage6_registry: 'Checking claimed entities against registry records.',
  stage9_apk_domain: 'Checking extracted domains and security indicators.',
  stage8_report: 'Preparing the evidence summary.',
  stage7_aggregation: 'Combining the confirmed findings into a final assessment.',
};

/* ── Routing & Navigation ────────────────────────────────────────────────── */

function showRoute(route) {
  if (route === '/analysis' && !state.run && state.route !== '/analyze') {
    route = '/analyze';
  }
  if (state.route === '/analysis' && route !== '/analysis' && state.run) {
    state.run.cancel();
    state.run = null;
    stopTipRotation();
  }

  state.route = route;
  if (window.location.pathname !== route) {
    history.pushState({}, '', route);
  }

  // View visibility
  $('#view-landing').hidden = route !== '/';
  $('#view-how').hidden = route !== '/how-it-works';
  $('#view-features').hidden = route !== '/features';
  $('#view-technology').hidden = route !== '/technology';
  $('#view-analyze').hidden = route !== '/analyze';
  $('#view-analysis').hidden = route !== '/analysis';
  $('#view-results').hidden = route !== '/results';

  // Highlight active nav links
  $$('.fg-nav__link').forEach((link) => {
    link.classList.toggle('fg-nav__link--active', link.dataset.route === route);
  });

  // Close mobile drawer
  $('#nav-header').removeAttribute('data-mobile-open');
  $('#nav-toggle').setAttribute('aria-expanded', 'false');

  // Route-specific triggers
  if (route === '/analyze') {
    renderWorkspace();
  } else if (route === '/results' && state.viewModel) {
    renderReport(state.viewModel);
  }

  window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
}

function initMotionEffects() {
  if (reducedMotion() || typeof IntersectionObserver === 'undefined') return;

  const revealTargets = $$('#view-landing .fg-section-header, #view-landing .fg-step-box, #view-landing .fg-warning-card, #view-landing .fg-mode-card, #view-landing .fg-final-cta__inner, #view-how .fg-step-box, #view-features .fg-card, #view-technology .fg-card');
  const orbit = $('.fg-hero-orbit');
  if (!revealTargets.length && !orbit) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.target === orbit) {
        entry.target.classList.toggle('fg-is-visible', entry.isIntersecting && !document.hidden);
      } else if (entry.isIntersecting) {
        entry.target.dataset.reveal = 'visible';
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -32px 0px' });

  revealTargets.forEach((target, index) => {
    target.dataset.reveal = 'pending';
    target.style.setProperty('--reveal-order', String(Math.min(index, 5)));
    observer.observe(target);
  });
  if (orbit) observer.observe(orbit);

  document.documentElement.classList.add('fg-motion-ready');
  document.addEventListener('visibilitychange', () => {
    document.documentElement.classList.toggle('fg-document-hidden', document.hidden);
  });
}

function bindNavigation() {
  document.addEventListener('click', (e) => {
    const modeTarget = e.target.closest('[data-analyze-mode]');
    if (modeTarget) {
      state.mode = modeTarget.dataset.analyzeMode;
      clearSelectedFile();
      state.text = '';
      state.urlText = '';
      showRoute('/analyze');
      return;
    }

    const routeTarget = e.target.closest('[data-route]');
    if (routeTarget) {
      e.preventDefault();
      showRoute(routeTarget.dataset.route);
    }
  });

  window.addEventListener('popstate', () => {
    showRoute(getInitialRoute());
  });

  // Mobile menu toggle
  const toggleBtn = $('#nav-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const header = $('#nav-header');
      const isOpen = header.getAttribute('data-mobile-open') === 'true';
      if (isOpen) {
        header.removeAttribute('data-mobile-open');
      } else {
        header.setAttribute('data-mobile-open', 'true');
      }
      toggleBtn.setAttribute('aria-expanded', String(!isOpen));
    });
  }
}

/* ── Service Health Check ────────────────────────────────────────────────── */

let healthRequestController = null;

function monitorHealth() {
  const healthPill = $('#health');
  const healthText = $('#health-text');
  if (!healthPill || !healthText) return;

  if (healthRequestController) healthRequestController.abort();
  const controller = new AbortController();
  healthRequestController = controller;
  const timeoutId = window.setTimeout(() => controller.abort(), 8000);

  healthPill.dataset.state = 'checking';
  healthText.textContent = 'Service checking';

  health(controller.signal)
    .then((data) => {
      if (healthRequestController !== controller) return;
      if (data && data.status === 'ok') {
        healthPill.dataset.state = 'online';
        healthText.textContent = `System Online${data.version ? ` (v${data.version})` : ''}`;
      } else {
        healthPill.dataset.state = 'offline';
        healthText.textContent = 'Backend degraded';
      }
    }, () => {
      if (healthRequestController !== controller) return;
      healthPill.dataset.state = 'offline';
      healthText.textContent = 'Backend offline';
    })
    .finally(() => {
      window.clearTimeout(timeoutId);
      if (healthRequestController === controller) healthRequestController = null;
    });
}

/* ── Analysis Workspace (Forms & Inputs) ─────────────────────────────────── */

function renderWorkspace() {
  const slot = $('#workspace-slot');
  const plan = planFor(state.mode);
  const formatInfo = {
    video: 'MP4, AVI, MOV, MKV · Maximum 100 MB',
    audio: 'MP3, WAV, OGG, M4A, FLAC, AAC · Maximum 100 MB',
    image: 'JPG, JPEG, PNG, WEBP, BMP · Maximum 100 MB',
    text: 'Paste a message or post · Minimum 5 characters',
    url: 'Enter a website URL or domain',
    apk: 'APK · Maximum 100 MB · Static inspection only; the app is never executed',
  };

  // Update sidebar stages list
  $('#sidebar-plan-title').textContent = `${state.mode.toUpperCase()} Inspection Plan`;
  $('#sidebar-plan-info').textContent = formatInfo[state.mode];
  $('#sidebar-stages-list').innerHTML = plan
    .map((stage, idx) => `
      <li class="fg-stages-list__item">
        <span class="fg-stages-list__idx">${String(idx + 1).padStart(2, '0')}</span>
        <div class="fg-stages-list__text">
          <b>${esc(stage.label)}</b>
          <span>${esc(stage.sub)}</span>
        </div>
      </li>
    `)
    .join('');

  // Update tab selection
  $$('.fg-tab').forEach((tab) => {
    tab.setAttribute('aria-selected', String(tab.dataset.mode === state.mode));
  });

  clearWorkspaceError();

  // Mode: Text
  if (state.mode === 'text') {
    slot.innerHTML = `
      <div class="fg-input-box">
        <label class="fg-input-label" for="text-input">
          Financial Message or Claim Text
        </label>
        <textarea class="fg-textarea" id="text-input" aria-describedby="text-help text-counter" placeholder="Paste suspicious investment messages, WhatsApp tips, or social media post text here...">${esc(state.text)}</textarea>
        <div class="fg-counter-row" id="text-help">
          <span>Minimum 5 characters for compliance analysis</span>
          <span id="text-counter" aria-live="polite">${state.text.length} characters</span>
        </div>
        <div class="fg-input-actions">
          <button class="fg-btn" id="submit-text-btn" type="button">
            Analyze Text
          </button>
        </div>
      </div>
    `;

    const textarea = $('#text-input');
    textarea.addEventListener('input', () => {
      state.text = textarea.value;
      $('#text-counter').textContent = `${state.text.length} characters`;
    });

    $('#submit-text-btn').addEventListener('click', () => {
      const check = validateText(state.text);
      if (!check.ok) return showWorkspaceError(check.message);
      clearWorkspaceError();
      launchAnalysis();
    });
    return;
  }

  // Mode: URL
  if (state.mode === 'url') {
    slot.innerHTML = `
      <div class="fg-input-box">
        <label class="fg-input-label" for="url-input">
          Website Address or Domain
        </label>
        <input class="fg-input-url" id="url-input" type="text" inputmode="url" autocomplete="url" aria-describedby="url-help url-counter" placeholder="https://example-broker.com or example-broker.com" value="${esc(state.urlText)}">
        <div class="fg-counter-row" id="url-help">
          <span>Checks against registered SEBI broker domains and known phishing signatures</span>
          <span id="url-counter" aria-live="polite">${state.urlText.length} characters</span>
        </div>
        <div class="fg-input-actions">
          <button class="fg-btn" id="submit-url-btn" type="button">
            Audit URL
          </button>
        </div>
      </div>
    `;

    const urlInput = $('#url-input');
    urlInput.addEventListener('input', () => {
      state.urlText = urlInput.value;
      $('#url-counter').textContent = `${state.urlText.length} characters`;
    });

    $('#submit-url-btn').addEventListener('click', () => {
      const check = validateUrl(state.urlText);
      if (!check.ok) return showWorkspaceError(check.message);
      state.urlText = check.value;
      clearWorkspaceError();
      launchAnalysis();
    });
    return;
  }

  // Modes: Video, Audio, Image, APK
  if (state.file) {
    const preview = state.previewUrl && state.mode === 'video'
      ? `<div class="fg-selected-file__preview"><video controls preload="metadata" src="${esc(state.previewUrl)}" aria-label="Video preview"></video></div>`
      : state.previewUrl && state.mode === 'audio'
        ? `<div class="fg-selected-file__preview"><audio controls preload="metadata" src="${esc(state.previewUrl)}" aria-label="Audio preview"></audio></div>`
        : state.previewUrl && state.mode === 'image'
          ? `<div class="fg-selected-file__preview"><img src="${esc(state.previewUrl)}" alt="Selected image preview"></div>`
          : '';

    slot.innerHTML = `
      <div class="fg-selected-file">
        ${preview}
        <div class="fg-selected-file__meta">
          <div>
            <span class="fg-selected-file__label">Selected File</span>
            <span class="fg-selected-file__val" title="${esc(state.file.name)}">${esc(state.file.name)}</span>
          </div>
          <div>
            <span class="fg-selected-file__label">Content Type</span>
            <span class="fg-selected-file__val">${state.mode.toUpperCase()}</span>
          </div>
          <div>
            <span class="fg-selected-file__label">File Size</span>
            <span class="fg-selected-file__val">${fmtBytes(state.file.size)}</span>
          </div>
        </div>
        ${state.mode === 'apk' ? '<p class="fg-apk-notice">Static inspection only. The APK is parsed without executing the app.</p>' : ''}
        <div class="fg-selected-file__actions">
          <button class="fg-btn fg-btn--secondary" id="replace-file-btn" type="button">
            Replace File
          </button>
          <button class="fg-btn fg-btn--secondary" id="remove-file-btn" type="button">
            Remove
          </button>
          <button class="fg-btn" id="submit-file-btn" type="button">
            Analyze Now
          </button>
        </div>
      </div>
    `;

    $('#replace-file-btn').addEventListener('click', () => {
      clearSelectedFile();
      renderWorkspace();
      $('#file-upload').click();
    });

    $('#remove-file-btn').addEventListener('click', () => {
      clearSelectedFile();
      renderWorkspace();
    });

    $('#submit-file-btn').addEventListener('click', () => {
      launchAnalysis();
    });
    return;
  }

  // Render dropzone
  const modeLabel = state.mode === 'apk' ? 'Android APK package' : `${state.mode} file`;

  slot.innerHTML = `
    <label class="fg-dropzone" id="file-dropzone" for="file-upload" tabindex="0">
      <input class="fg-dropzone__input" id="file-upload" type="file" accept="${(LIMITS[state.mode] || []).join(',')}" aria-label="Choose ${esc(modeLabel)}">
      <svg class="fg-dropzone__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
      <span class="fg-dropzone__title">Select or drag a ${esc(modeLabel)}</span>
      <span class="fg-dropzone__desc">Click to browse your device or drag and drop your file here</span>
      <div class="fg-dropzone__formats">
        ${(LIMITS[state.mode] || []).map((ext) => `<span class="fg-dropzone__pill">${ext.toUpperCase().replace('.', '')}</span>`).join('')}
      </div>
      <span class="fg-dropzone__limit">Maximum allowed file size: 100 MB</span>
      ${state.mode === 'apk' ? '<span class="fg-apk-notice">Static inspection only. The APK is parsed without executing the app.</span>' : ''}
    </label>
  `;

  const fileInput = $('#file-upload');
  const dropzone = $('#file-dropzone');

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) {
      handleSelectedFile(fileInput.files[0]);
    }
  });

  ['dragenter', 'dragover'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.dataset.dragging = 'true';
    });
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.dataset.dragging = 'false';
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleSelectedFile(e.dataTransfer.files[0]);
    }
  });

  dropzone.addEventListener('dragleave', (e) => {
    if (!dropzone.contains(e.relatedTarget)) dropzone.dataset.dragging = 'false';
  });

  dropzone.addEventListener('keydown', (e) => {
    if (e.target === dropzone && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      fileInput.click();
    }
  });
}

function handleSelectedFile(file) {
  const check = validateFile(state.mode, file);
  if (!check.ok) {
    return showWorkspaceError(check.message);
  }
  clearWorkspaceError();

  releasePreviewUrl();
  state.file = file;
  if (['video', 'audio', 'image'].includes(state.mode)) {
    state.previewUrl = URL.createObjectURL(file);
  } else {
    state.previewUrl = null;
  }

  renderWorkspace();
}

function releasePreviewUrl() {
  if (!state.previewUrl) return;
  URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = null;
}

function clearSelectedFile() {
  releasePreviewUrl();
  state.file = null;
}

function showWorkspaceError(msg, retryable = false) {
  const errBox = $('#workspace-error');
  errBox.hidden = false;
  errBox.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
    <span class="fg-alert__message">${esc(msg)}</span>
    ${retryable ? '<button class="fg-btn fg-btn--secondary fg-btn--sm" id="retry-analysis-btn" type="button">Retry analysis</button>' : ''}
  `;
  errBox.setAttribute('role', 'alert');
  $('#retry-analysis-btn')?.addEventListener('click', launchAnalysis);
}

function clearWorkspaceError() {
  const errBox = $('#workspace-error');
  errBox.hidden = true;
  errBox.textContent = '';
}

/* ── Analysis Execution & Loading Orchestration ──────────────────────────── */

function launchAnalysis() {
  if (state.mode === 'text') {
    const validation = validateText(state.text);
    if (!validation.ok) return showWorkspaceError(validation.message);
  } else if (state.mode === 'url') {
    const validation = validateUrl(state.urlText);
    if (!validation.ok) return showWorkspaceError(validation.message);
    state.urlText = validation.value;
  } else {
    const validation = validateFile(state.mode, state.file);
    if (!validation.ok) return showWorkspaceError(validation.message);
  }

  if (state.run) {
    state.run.cancel();
  }

  state.startedAt = new Date();
  state.jobId = null;
  state.viewModel = null;

  showRoute('/analysis');

  const payload = state.mode === 'text'
    ? state.text
    : state.mode === 'url'
      ? state.urlText
      : state.file;

  const displayName = state.mode === 'text'
    ? 'Pasted Financial Text'
    : state.mode === 'url'
      ? state.urlText
      : state.file ? state.file.name : 'Submitted Content';

  $('#loading-filename').textContent = displayName;
  prepareAnalysisView(state.mode, displayName);

  startTipRotation();

  // Cancel button
  $('#cancel-analysis-btn').onclick = () => {
    state.run?.cancel();
    state.run = null;
    stopTipRotation();
    showRoute('/analyze');
  };

  // Launch the analysis run via api.js
  state.run = startRun(state.mode, payload, {
    onJob: (jobId) => {
      state.jobId = jobId;
      $('#analysis-job-ref').textContent = `Job ${jobId.slice(0, 8)}`;
      $('#analysis-state').textContent = 'Job queued';
    },
    onStatus: (text) => {
      $('#loading-status-text').textContent = text;
      if (state.mode === 'video') $('#analysis-state').textContent = 'Backend working';
      $('#loading-stage-label').textContent = state.mode === 'video'
        ? ($('#loading-stage-label').textContent || 'Waiting for backend status')
        : 'Waiting for backend result';
    },
    onStage: (index, stageState) => {
      updateAnalysisStage(index, stageState);
    },
    onDone: (result) => {
      state.run = null;
      $('#analysis-state').textContent = 'Analysis complete';
      $('#loading-status-text').textContent = 'The backend returned a completed analysis.';
      $('#loading-stage-label').textContent = 'Backend confirmed completion';
      $('#loading-stage-count').textContent = state.mode === 'video'
        ? `Stage ${planFor(state.mode).length} of ${planFor(state.mode).length}`
        : 'Complete';
      $('#loading-track').dataset.indeterminate = 'false';
      $('#loading-track').setAttribute('aria-valuenow', '100');
      $('#loading-bar').style.width = '100%';
      if (state.mode === 'video') renderAnalysisStages(null, true);
      stopTipRotation();
      handleAnalysisSuccess(result);
    },
    onError: (err) => {
      state.run = null;
      stopTipRotation();
      handleAnalysisError(err);
    },
  });
}

function prepareAnalysisView(mode, displayName) {
  const isVideo = mode === 'video';
  const plan = planFor(mode);
  const stagePanel = $('#analysis-stage-panel');
  const syncNote = $('#analysis-sync-note');

  $('#analysis-mode').textContent = `${mode.toUpperCase()} ANALYSIS`;
  $('#analysis-state').textContent = isVideo ? 'Submitting video job' : 'Request in progress';
  $('#loading-filename').textContent = displayName;
  $('#loading-filename').title = displayName;
  $('#loading-status-text').textContent = isVideo
    ? 'Submitting your video for backend analysis.'
    : `Sending your ${mode} scan. Waiting for the backend response.`;
  $('#loading-stage-label').textContent = isVideo
    ? 'Waiting for backend status'
    : 'Waiting for backend result';
  $('#loading-stage-count').textContent = isVideo ? 'Awaiting status' : 'No stage feed';
  $('#analysis-job-ref').textContent = 'Job reference pending';
  $('#loading-track').dataset.indeterminate = 'true';
  $('#loading-track').removeAttribute('aria-valuenow');
  $('#loading-bar').style.width = '';

  stagePanel.hidden = !isVideo;
  syncNote.hidden = isVideo;
  if (isVideo) renderAnalysisStages(null, false);

  plan.forEach((_, index) => {
    if (isVideo) updateAnalysisStage(index, 'pending');
  });
}

function renderAnalysisStages(activeIndex, completed, failedIndex = null) {
  const plan = planFor('video');
  const list = $('#analysis-stage-list');
  list.innerHTML = plan.map((stage, index) => {
    const status = completed
      ? 'done'
      : index === failedIndex
        ? 'failed'
        : index === activeIndex
          ? 'active'
          : 'pending';
    const stateText = status === 'done'
      ? 'Complete'
      : status === 'active'
        ? 'In progress'
        : status === 'failed'
          ? 'Failed'
          : 'Awaiting confirmation';
    return `
      <li class="fg-live__stage" data-state="${status}">
        <span class="fg-live__stage-marker" aria-hidden="true">${status === 'done' ? '✓' : String(index + 1).padStart(2, '0')}</span>
        <span class="fg-live__stage-copy">
          <span class="fg-live__stage-name">${esc(stage.label)}</span>
          <span class="fg-live__stage-detail">${esc(stage.sub)}</span>
        </span>
        <span class="fg-live__stage-state">${stateText}</span>
      </li>
    `;
  }).join('');

  list.setAttribute('aria-label', completed
    ? 'All video analysis stages complete'
    : activeIndex === null
      ? 'Video stages awaiting backend confirmation'
      : `Backend-reported current stage: ${plan[activeIndex].label}`);
}

function updateAnalysisStage(index, stageState) {
  const plan = planFor('video');
  const stage = plan[index];
  if (!stage || state.mode !== 'video') return;

  if (stageState === 'active') {
    renderAnalysisStages(index, false);
    $('#loading-stage-label').textContent = stage.label;
    $('#loading-stage-count').textContent = `Stage ${index + 1} of ${plan.length}`;
    $('#loading-status-text').textContent = STAGE_ACTIVITY[stage.key] || 'The backend is processing this stage.';
    $('#analysis-state').textContent = 'Backend working';
    $('#loading-track').dataset.indeterminate = 'true';
    $('#loading-track').removeAttribute('aria-valuenow');
  } else if (stageState === 'failed') {
    renderAnalysisStages(null, false, index);
  }
}

function handleAnalysisSuccess(result) {
  try {
    state.viewModel = toViewModel(result, {
      mode: state.mode,
      filename: state.mode === 'text'
        ? 'Pasted Text'
        : state.mode === 'url'
          ? state.urlText
          : state.file ? state.file.name : 'Submitted Content',
      jobId: state.jobId,
      size: state.file ? state.file.size : null,
      startedAt: state.startedAt,
    });
    showRoute('/results');
  } catch (err) {
    console.error('Error assembling view model:', err);
    showRoute('/analyze');
    showWorkspaceError('An error occurred while formatting the analysis results: ' + (err?.message || err));
  }
}

function handleAnalysisError(err) {
  showRoute('/analyze');
  const msg = err?.message || 'The analysis service could not complete your request. Please try again.';
  showWorkspaceError(msg, true);
}

/* ── Scam Awareness Tips Rotation ────────────────────────────────────────── */

function startTipRotation() {
  stopTipRotation();
  state.tipIndex = 0;
  displayCurrentTip();

  const startTimer = () => {
    if (state.tipTimer || document.hidden || state.route !== '/analysis') return;
    state.tipTimer = setInterval(() => {
      if (document.hidden || state.route !== '/analysis') return;
      state.tipIndex = (state.tipIndex + 1) % SCAM_TIPS.length;
      displayCurrentTip();
    }, 5000);
  };

  state.tipVisibilityHandler = () => {
    if (document.hidden) {
      clearInterval(state.tipTimer);
      state.tipTimer = null;
    } else {
      startTimer();
    }
  };
  document.addEventListener('visibilitychange', state.tipVisibilityHandler);
  startTimer();

  $('#tip-prev-btn').onclick = () => {
    state.tipIndex = (state.tipIndex - 1 + SCAM_TIPS.length) % SCAM_TIPS.length;
    displayCurrentTip();
  };

  $('#tip-next-btn').onclick = () => {
    state.tipIndex = (state.tipIndex + 1) % SCAM_TIPS.length;
    displayCurrentTip();
  };
}

function stopTipRotation() {
  if (state.tipTimer) {
    clearInterval(state.tipTimer);
    state.tipTimer = null;
  }
  if (state.tipSwapTimeout) {
    clearTimeout(state.tipSwapTimeout);
    state.tipSwapTimeout = null;
  }
  if (state.tipVisibilityHandler) {
    document.removeEventListener('visibilitychange', state.tipVisibilityHandler);
    state.tipVisibilityHandler = null;
  }
}

function displayCurrentTip() {
  const tipContent = $('#tip-content');
  const tipCounter = $('#tip-counter');
  if (tipContent && tipCounter) {
    if (state.tipSwapTimeout) clearTimeout(state.tipSwapTimeout);
    if (!reducedMotion()) tipContent.style.opacity = '0';
    state.tipSwapTimeout = setTimeout(() => {
      tipContent.textContent = SCAM_TIPS[state.tipIndex];
      tipCounter.textContent = `Tip ${state.tipIndex + 1} / ${SCAM_TIPS.length}`;
      tipContent.style.opacity = '';
      state.tipSwapTimeout = null;
    }, 150);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   RESULTS & FORENSIC REPORT RENDERING
   ═══════════════════════════════════════════════════════════════════════ */

function renderReportDetails(rows) {
  if (!rows.length) return '<p class="fg-report__missing">Not available</p>';
  return `
    <dl class="fg-report__data">
      ${rows.map(([label, value]) => `
        <div class="fg-report__data-row">
          <dt>${esc(label)}</dt>
          <dd>${esc(value)}</dd>
        </div>
      `).join('')}
    </dl>
  `;
}

function renderReport(vm) {
  const container = $('#report-container');

  const peakScoreDisplay = vm.peakSignal !== null ? `${Math.round(vm.peakSignal * 100)}%` : 'Not available';
  const urlResult = vm.raw.url_result || {};
  const domainResult = vm.raw.domain_scan || {};
  const hasUrlResult = Boolean(
    (vm.raw.url_result && typeof vm.raw.url_result === 'object')
    || (vm.raw.domain_scan && typeof vm.raw.domain_scan === 'object')
  );
  const hasApkResult = (vm.raw.apk_result || vm.raw.apk_analysis)
    && typeof (vm.raw.apk_result || vm.raw.apk_analysis) === 'object';
  const apkResult = vm.raw.apk_result || vm.raw.apk_analysis || {};
  const complaintAvailable = vm.hasScoresComplaint || Boolean(vm.jobId);
  const transcriptDisclosure = vm.transcriptAvailable ? `
    <details class="fg-report__disclosure">
      <summary>Timestamped transcript</summary>
      ${vm.transcript.length ? `
        <ol class="fg-transcript">
          ${vm.transcript.map((segment) => `
            <li><time>${segment.start !== null ? fmtClock(segment.start) : 'Not available'}${segment.end !== null ? `–${fmtClock(segment.end)}` : ''}</time><span>${esc(segment.text)}</span></li>
          `).join('')}
        </ol>
      ` : `<p class="fg-report__missing">${esc(vm.transcriptText)}</p>`}
    </details>
  ` : '';
  const timelineDisclosure = vm.timeline.length ? `
    <details class="fg-report__disclosure">
      <summary>Media timeline</summary>
      <ol class="fg-timeline">
        ${vm.timeline.map((item) => {
          const time = typeof item.start === 'number'
            ? `${fmtClock(item.start)}${typeof item.end === 'number' ? `–${fmtClock(item.end)}` : ''}`
            : 'Timestamp not available';
          const fields = [
            ['Audio score', item.audio_score],
            ['Text signal', item.text_flag],
            ['Quote', item.quote],
          ].filter(([, value]) => value !== undefined && value !== null && value !== '');
          return `<li><time>${esc(time)}</time><div>${renderReportDetails(fields)}</div></li>`;
        }).join('')}
      </ol>
    </details>
  ` : '';
  const heatmapDisclosure = vm.videoModality.heatmap && (vm.mode === 'video' || vm.mode === 'image') ? `
    <details class="fg-report__disclosure">
      <summary>Visual forensic heatmap</summary>
      <img class="fg-report__heatmap" src="${esc(vm.videoModality.heatmap)}" alt="Backend-provided visual forensic heatmap">
    </details>
  ` : '';
  const urlDisclosure = hasUrlResult ? `
    <details class="fg-report__disclosure">
      <summary>URL and phishing findings</summary>
      ${renderReportDetails([
        ['Input', urlResult.input],
        ['Normalized host', urlResult.normalised_host],
        ['URLs found', Array.isArray(domainResult.urls_found) ? domainResult.urls_found.join(', ') : undefined],
        ['Phishing status', typeof urlResult.is_phishing === 'boolean'
          ? (urlResult.is_phishing ? 'Flagged' : 'Not flagged')
          : typeof domainResult.any_phishing === 'boolean'
            ? (domainResult.any_phishing ? 'Flagged' : 'Not flagged')
            : undefined],
        ['Risk level', urlResult.risk_level],
        ['Matched legitimate domain', urlResult.matched_legitimate_domain],
        ['Legitimate broker', urlResult.legitimate_broker],
        ['Reason', urlResult.reason],
      ].filter(([, value]) => value !== undefined && value !== null && value !== ''))}
      ${Array.isArray(domainResult.flagged_domains) && domainResult.flagged_domains.length ? `
        <h4>Flagged domains</h4>
        ${domainResult.flagged_domains.map((domain) => renderReportDetails([
          ['Input', domain.input],
          ['Normalized host', domain.normalised_host],
          ['Risk level', domain.risk_level],
          ['Matched legitimate domain', domain.matched_legitimate_domain],
          ['Reason', domain.reason],
        ].filter(([, value]) => value !== undefined && value !== null && value !== ''))).join('')}
      ` : ''}
    </details>
  ` : '';
  const apkDisclosure = hasApkResult ? `
    <details class="fg-report__disclosure">
      <summary>APK package and permission findings</summary>
      ${renderReportDetails([
        ['Package name', apkResult.package_name],
        ['App name', apkResult.app_name],
        ['Suspicious status', typeof apkResult.is_suspicious === 'boolean' ? (apkResult.is_suspicious ? 'Flagged' : 'Not flagged') : undefined],
        ['Impersonated broker', apkResult.impersonated_broker],
        ['Dangerous permissions', Array.isArray(apkResult.dangerous_permissions_found || apkResult.dangerous_permissions)
          ? (apkResult.dangerous_permissions_found || apkResult.dangerous_permissions).join(', ')
          : undefined],
        ['Reason', apkResult.reason],
      ].filter(([, value]) => value !== undefined && value !== null && value !== ''))}
      <p class="fg-report__note">APK inspection is static; the app is never executed.</p>
    </details>
  ` : '';
  const extraFindings = [heatmapDisclosure, timelineDisclosure, transcriptDisclosure, urlDisclosure, apkDisclosure]
    .filter(Boolean).join('');

  container.innerHTML = `
    <!-- Overall Assessment Banner -->
    <section class="fg-verdict-banner" data-tier="${vm.tier.key}">
      <div class="fg-verdict-grid">
        <div>
          <span class="fg-verdict-badge ${vm.tier.badgeClass}">
            ${esc(vm.tier.label)}
          </span>
          <h2 class="fg-verdict-title">${esc(vm.tier.label)}</h2>
          <p class="fg-verdict-summary">${esc(vm.overallSummary)}</p>
          <div class="fg-verdict-meta">
            <span>Content: <b>${esc(vm.filename)}</b></span>
            <span>Analyzed: <b>${fmtStamp(vm.startedAt)}</b></span>
            <span>Inspection Mode: <b>${esc(vm.mode.toUpperCase())}</b></span>
            ${vm.jobId ? `<span>Reference ID: <b>${esc(vm.jobId.slice(0, 8))}</b></span>` : ''}
          </div>
        </div>

        <!-- Gauge Box -->
        <div class="fg-gauge-box" aria-label="Backend-reported overall risk score">
          <div class="fg-gauge-score">${peakScoreDisplay}</div>
          <div class="fg-gauge-label">Backend risk score</div>
        </div>
      </div>

      <div class="fg-verdict-actions">
        <button class="fg-btn fg-btn--secondary" type="button" data-route="/analyze">
          Analyze another
        </button>
        ${complaintAvailable ? `
          <button class="fg-btn" id="download-complaint-btn" type="button">Download complaint draft</button>
        ` : ''}
      </div>
      ${complaintAvailable ? '<p class="fg-report__action-status" id="complaint-action-status" role="status" hidden></p>' : ''}
    </section>

    <p class="fg-report__separation">Media authenticity and financial scam indicators are assessed separately. Synthetic media is not automatically fraudulent, and genuine media is not automatically safe.</p>

    <!-- Modality Scorecards Grid -->
    <div class="fg-section-header">
      <span class="fg-section-header__eyebrow">Modality Breakdown</span>
      <h3 class="fg-section-header__title" style="font-size:1.25rem;">Detector-Specific Findings</h3>
      <p class="fg-section-header__desc">Each detector operates independently. Scores are not combined or fabricated.</p>
    </div>

    <div class="fg-modalities-grid">
      <!-- 1. Video Authenticity -->
      <article class="fg-modality-card" data-modality-title="${esc(vm.audioModality.title || 'Audio Check')}">
        <div class="fg-modality-card__head">
          <h4 class="fg-modality-card__title">Video Authenticity</h4>
          <span class="fg-modality-card__badge ${vm.videoModality.isFlagged ? 'fg-badge--high' : vm.videoModality.available ? 'fg-badge--safe' : 'fg-badge--idle'}">
            ${esc(vm.videoModality.scoreFormatted)}
          </span>
        </div>
        <div class="fg-modality-card__body">
          <div class="fg-modality-card__status">${esc(vm.videoModality.status)}</div>
          <div class="fg-modality-card__desc">${esc(vm.videoModality.summary)}</div>
          ${vm.videoModality.details.length ? `
            <details class="fg-report__disclosure">
              <summary>Video authenticity details</summary>
              ${renderReportDetails(vm.videoModality.details.map((item) => [item.label, item.value]))}
            </details>
          ` : ''}
        </div>
      </article>

      <!-- 2. Audio Check -->
      <article class="fg-modality-card" data-modality-title="${esc(vm.audioModality.title || 'Audio Check')}">
        <div class="fg-modality-card__head">
          <h4 class="fg-modality-card__title">Voice Authenticity</h4>
          <span class="fg-modality-card__badge ${vm.audioModality.badgeClass || (vm.audioModality.isFlagged ? 'fg-badge--high' : vm.audioModality.available ? 'fg-badge--safe' : 'fg-badge--idle')}">
            ${esc(vm.audioModality.scoreFormatted)}
          </span>
        </div>
        <div class="fg-modality-card__body">
          <div class="fg-modality-card__status">${esc(vm.audioModality.status)}</div>
          <div class="fg-modality-card__desc">${esc(vm.audioModality.summary)}</div>
          ${vm.audioModality.details.length ? `
            <details class="fg-report__disclosure">
              <summary>Voice authenticity details</summary>
              ${renderReportDetails(vm.audioModality.details.map((item) => [item.label, item.value]))}
            </details>
          ` : ''}
        </div>
      </article>

      <!-- 3. Scam Check -->
      <article class="fg-modality-card" data-modality-title="${esc(vm.scamModality.title || 'Scam Check')}">
        <div class="fg-modality-card__head">
          <h4 class="fg-modality-card__title">Scam &amp; Compliance</h4>
          <span class="fg-modality-card__badge ${vm.scamModality.badgeClass || (vm.scamModality.isFlagged ? 'fg-badge--high' : vm.scamModality.available ? 'fg-badge--safe' : 'fg-badge--idle')}">
            ${esc(vm.scamModality.scoreFormatted)}
          </span>
        </div>
        <div class="fg-modality-card__body">
          <div class="fg-modality-card__status">${esc(vm.scamModality.status)}</div>
          <div class="fg-modality-card__desc">${esc(vm.scamModality.summary)}</div>
          <details class="fg-report__disclosure">
            <summary>Scam and compliance details</summary>
            <div class="fg-modality-card__details">
            <div class="fg-detail-row">
              <span>${esc(vm.scamModality.quotedLabel || 'Quoted Violations')}</span>
              <span>${vm.scamModality.quotedCount === null ? 'Not available' : vm.scamModality.quotedCount}</span>
              </div>
            </details>
            ${vm.scamModality.signals.filter(s => s.active).map(s => `
              <div class="fg-detail-row">
                <span>${esc(s.label)}</span>
                <span class="fg-report__flagged">${s.score === null ? 'Not available' : `Flagged (${s.score}%)`}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </article>

      <!-- 4. SEBI Registry Verification -->
      <article class="fg-modality-card">
        <div class="fg-modality-card__head">
          <h4 class="fg-modality-card__title">SEBI Registry Verification</h4>
          <span class="fg-modality-card__badge ${vm.registryModality.isFlagged ? 'fg-badge--high' : vm.registryModality.tier === 'low' ? 'fg-badge--safe' : 'fg-badge--idle'}">
            ${esc(vm.registryModality.badge)}
          </span>
        </div>
        <div class="fg-modality-card__body">
          <div class="fg-modality-card__status">${esc(vm.registryModality.label)}</div>
          <div class="fg-modality-card__desc">${esc(vm.registryModality.summary)}</div>
          <details class="fg-report__disclosure">
            <summary>Registry match details</summary>
            <div class="fg-modality-card__details">
            ${vm.registryModality.claimedName ? `
              <div class="fg-detail-row">
                <span>Claimed Name</span>
                <span>${esc(vm.registryModality.claimedName)}</span>
                </div>
              </details>
            ` : ''}
            ${vm.registryModality.claimedNumber ? `
              <div class="fg-detail-row">
                <span>Claimed Number</span>
                <span>${esc(vm.registryModality.claimedNumber)}</span>
              </div>
            ` : ''}
            ${vm.registryModality.matchedName ? `
              <div class="fg-detail-row">
                <span>Registered Entity</span>
                <span>${esc(vm.registryModality.matchedName)}</span>
              </div>
            ` : ''}
            ${vm.registryModality.matchedNumber ? `
              <div class="fg-detail-row">
                <span>Registered Number</span>
                <span>${esc(vm.registryModality.matchedNumber)}</span>
              </div>
            ` : ''}
            ${vm.registryModality.matchedCategory ? `
              <div class="fg-detail-row">
                <span>Registry Category</span>
                <span>${esc(vm.registryModality.matchedCategory)}</span>
              </div>
            ` : ''}
          </div>
        </div>
      </article>
    </div>

    ${extraFindings ? `
      <section class="fg-report__details-section" aria-labelledby="report-details-title">
        <div class="fg-section-header">
          <span class="fg-section-header__eyebrow">Mode-specific evidence</span>
          <h3 class="fg-section-header__title" id="report-details-title">Supporting details</h3>
        </div>
        ${extraFindings}
      </section>
    ` : ''}

    <!-- Quoted Evidence Audit Trail Table -->
    <section class="fg-evidence-section">
      <h3 style="font-size:1.15rem;margin-bottom:0.75rem;">Verified Evidence & Findings</h3>
      ${vm.evidence.length ? `
        <details class="fg-report__disclosure">
          <summary>Evidence audit (${vm.evidence.length})</summary>
          <div class="fg-table-wrap">
            <table class="fg-table">
              <thead>
                <tr>
                  <th style="width:60px;">ID</th>
                  <th style="width:180px;">Signal Category</th>
                  <th style="width:140px;">Source Module</th>
                  <th>Observed Evidence / Quoted Statement</th>
                  <th style="width:100px;">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                ${vm.evidence.map(item => `
                  <tr>
                    <td><b>${esc(item.id)}</b></td>
                    <td>${esc(item.kind)}</td>
                    <td><span class="fg-card__tag">${esc(item.source)}</span></td>
                    <td>
                      ${item.body ? `<div>${esc(item.body)}</div>` : ''}
                      ${item.quote ? `<div class="fg-quote-text">"${esc(item.quote)}"</div>` : ''}
                    </td>
                    <td>${item.timestamp !== null ? fmtClock(item.timestamp) : 'Not available'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </details>
      ` : `
        <p class="fg-report__missing">${vm.evidenceAvailable
          ? 'No explicit evidence items were returned for this submission.'
          : 'Not available'}</p>
      `}
    </section>

    <!-- Recommended Next Steps -->
    <section class="fg-next-steps">
      <h3 class="fg-next-steps__title">Recommended Next Steps</h3>
      <ul class="fg-steps-list">
        ${vm.nextSteps.map(step => `
          <li class="fg-step-item">
            <svg class="fg-step-item__icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            <div>
              <div class="fg-step-item__title">${esc(step.title)}</div>
              <p class="fg-step-item__desc">${esc(step.body)}</p>
            </div>
          </li>
        `).join('')}
      </ul>
    </section>

    <!-- Pre-Filing SEBI SCORES Complaint Draft -->
    ${complaintAvailable ? `
      <section class="fg-complaint-box">
        <div class="fg-complaint-box__header">
          <h3 style="font-size:1.15rem;margin:0;">SEBI SCORES Complaint Draft (Pre-Filing Preview)</h3>
          <div class="fg-complaint-box__actions">
            <button class="fg-btn fg-btn--secondary fg-btn--sm" id="copy-complaint-btn" type="button">Copy draft text</button>
            ${!vm.jobId && vm.hasScoresComplaint ? '<button class="fg-btn fg-btn--secondary fg-btn--sm" id="download-complaint-inline-btn" type="button">Download draft</button>' : ''}
          </div>
        </div>
        <div class="fg-complaint-notice">
          <b>Notice:</b> This is a pre-filing draft, not an officially submitted legal complaint. Review it before filing through the official SEBI SCORES portal (<a href="https://scores.sebi.gov.in" target="_blank" rel="noopener noreferrer">scores.sebi.gov.in</a>).
        </div>
        <details class="fg-report__disclosure">
          <summary>Preview complaint draft</summary>
          <pre class="fg-complaint-pre" id="complaint-pre">${vm.hasScoresComplaint ? esc(vm.scoresComplaint) : 'Not available'}</pre>
        </details>
      </section>
    ` : ''}

    <div style="text-align:center;margin-top:2rem;">
      <button class="fg-btn fg-btn--secondary" type="button" data-route="/analyze">
        Start a New Analysis
      </button>
    </div>
  `;

  const actionStatus = $('#complaint-action-status');
  const showComplaintActionError = (message, retryLabel, retryAction) => {
    if (!actionStatus) return;
    actionStatus.replaceChildren(document.createTextNode(message));
    if (retryAction) {
      const retryButton = document.createElement('button');
      retryButton.className = 'fg-btn fg-btn--secondary fg-btn--sm';
      retryButton.type = 'button';
      retryButton.textContent = retryLabel;
      retryButton.addEventListener('click', retryAction, { once: true });
      actionStatus.append(' ', retryButton);
    }
    actionStatus.hidden = false;
  };

  const downloadComplaint = async () => {
    try {
      const text = vm.jobId ? await getJobComplaint(vm.jobId) : vm.scoresComplaint;
      if (typeof text !== 'string' || !text.trim()) {
        throw new Error('The complaint draft is not available from the analysis service.');
      }
      const blobUrl = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = 'FinGuard_SEBI_SCORES_Complaint.txt';
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
      if (actionStatus) actionStatus.hidden = true;
    } catch (error) {
      const message = error?.message || 'Could not download the complaint draft.';
      showComplaintActionError(message, 'Retry download', downloadComplaint);
    }
  };

  // Attach copy and complaint download actions.
  const copyBtn = $('#copy-complaint-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        const text = vm.scoresComplaint || (vm.jobId ? await getJobComplaint(vm.jobId) : '');
        if (!text) throw new Error('The complaint draft is not available from the analysis service.');
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is not available in this browser.');
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = 'Copied to Clipboard!';
        if (actionStatus) actionStatus.hidden = true;
        setTimeout(() => { copyBtn.textContent = 'Copy draft text'; }, 2000);
      } catch (error) {
        const message = error?.message || 'Could not copy the complaint draft.';
        showComplaintActionError(message, 'Retry copy', () => copyBtn.click());
      }
    });
  }
  ['#download-complaint-btn', '#download-complaint-inline-btn'].forEach((selector) => {
    const button = $(selector);
    button?.addEventListener('click', downloadComplaint);
  });
}

/* ── Application Initialisation ──────────────────────────────────────────── */

function init() {
  initMotionEffects();
  bindNavigation();
  monitorHealth();
  setInterval(monitorHealth, 30000);
  window.addEventListener('pagehide', () => {
    state.run?.cancel();
    releasePreviewUrl();
  });

  // Mode tab switching in workspace
  $$('.fg-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      state.mode = tab.dataset.mode;
      clearSelectedFile();
      state.text = '';
      state.urlText = '';
      renderWorkspace();
    });
  });

  // Show starting route
  showRoute(state.route);
}

// Boot on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}