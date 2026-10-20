/* ============================================================================
   FinGuard Transport Layer — Central API Service Module
   ----------------------------------------------------------------------------
   Connects the frontend to the existing backend and preserves all API contracts:
     POST /api/jobs                    multipart `file`  -> {job_id, status}
     GET  /api/jobs/{job_id}                             -> {status, stage, result, error}
     GET  /api/jobs/{job_id}/complaint                   -> text/plain
     POST /api/scan/audio              multipart `file`  -> full result (synchronous)
     POST /api/scan/image              multipart `file`  -> full result (synchronous)
     POST /api/scan/text               json {text}       -> full result (synchronous)
     POST /api/scan/url                json {url}        -> full result (synchronous)
     POST /api/scan/apk                multipart `file`  -> full result (synchronous)
     GET  /api/registry/status                           -> {total_records, last_sync, ...}
     GET  /api/health                                    -> {status, version, service}
   ========================================================================= */

import { ext } from './dom.js';
import { planFor } from './stages.js';

/* ── Environment & API Base URL Configuration ────────────────────────────── */

/**
 * Resolves the backend API base URL:
 * 1. window.FINGUARD_API_BASE or window.__FINGUARD_API_BASE__
 * 2. <meta name="finguard-api-base" content="...">
 * 3. localStorage.getItem('finguard_api_base')
 * 4. When using the standalone runner, defaults to "" so /api requests use its
 *    configured backend proxy.
 * 5. In production / same-origin: defaults to "" (relative path)
 */
export function getApiBase() {
  if (typeof window === 'undefined') return '';
  if (window.FINGUARD_API_BASE) {
    return String(window.FINGUARD_API_BASE).replace(/\/+$/, '');
  }
  if (window.__FINGUARD_API_BASE__) {
    return String(window.__FINGUARD_API_BASE).replace(/\/+$/, '');
  }
  const meta = document.querySelector('meta[name="finguard-api-base"]');
  if (meta && meta.getAttribute('content')) {
    return meta.getAttribute('content').replace(/\/+$/, '');
  }
  try {
    const stored = localStorage.getItem('finguard_api_base');
    if (stored) return stored.replace(/\/+$/, '');
  } catch (_) {
    // Storage access might be restricted in some iframe contexts
  }
  return '';
}

/** Formats an absolute or relative API URL using the configured base. */
export function apiUrl(path) {
  const base = getApiBase();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${cleanPath}` : cleanPath;
}

/* ── Limits & Validation Rules ───────────────────────────────────────────── */

export const LIMITS = {
  maxBytes: 100 * 1024 * 1024, // 100 MB max file size
  video: ['.mp4', '.avi', '.mov', '.mkv'],
  audio: ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'],
  image: ['.jpg', '.jpeg', '.png', '.webp', '.bmp'],
  apk: ['.apk'],
  minTextChars: 5,
  minUrlChars: 3,
};

export class ServiceError extends Error {
  constructor(message, status, details = null) {
    super(message);
    this.name = 'ServiceError';
    this.status = status;
    this.details = details;
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 300000, parseResponse = (response) => response) {
  const controller = new AbortController();
  const callerSignal = options.signal;
  let timedOut = false;
  let timeoutId;
  const abortFromCaller = () => controller.abort();

  if (callerSignal?.aborted) {
    controller.abort();
  } else {
    callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
  }

  timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return await parseResponse(response);
  } catch (error) {
    if (timedOut) {
      throw new ServiceError(`The request timed out after ${Math.round(timeoutMs / 1000)} seconds. Please retry.`, 408);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    callerSignal?.removeEventListener('abort', abortFromCaller);
  }
}

async function readError(response) {
  const responseText = await response.text();
  let detail = responseText;
  let parsed = null;
  if (responseText) {
    try {
      parsed = JSON.parse(responseText);
      detail = typeof parsed?.detail === 'string'
        ? parsed.detail
        : (parsed?.error || JSON.stringify(parsed?.detail ?? parsed));
    } catch (_) {
      detail = responseText;
    }
  }
  const fallbackMessage = response.status === 413
    ? 'The uploaded file exceeds the 100 MB size limit.'
    : response.status === 404
      ? 'The requested analysis or service endpoint was not found.'
      : response.status >= 500
        ? 'The analysis service encountered an internal error. Please try again.'
        : `Request failed with status code ${response.status}.`;
  return new ServiceError(detail || fallbackMessage, response.status, parsed);
}

async function asJson(response) {
  if (!response.ok) throw await readError(response);
  return response.json();
}

/* ── Core API Endpoints ──────────────────────────────────────────────────── */

export async function health(signal) {
  return fetchWithTimeout(apiUrl('/api/health'), { cache: 'no-store', signal }, 8000, asJson);
}

export async function registryStatus(signal) {
  return fetchWithTimeout(apiUrl('/api/registry/status'), { cache: 'no-store', signal }, 15000, asJson);
}

async function postMultipart(path, file, signal) {
  const form = new FormData();
  form.append('file', file, file.name);
  return fetchWithTimeout(apiUrl(path), {
    method: 'POST',
    body: form,
    signal,
  }, 300000, asJson);
}

export const createVideoJob = (file, signal) => postMultipart('/api/jobs', file, signal);
export const scanAudio      = (file, signal) => postMultipart('/api/scan/audio', file, signal);
export const scanImage      = (file, signal) => postMultipart('/api/scan/image', file, signal);
export const scanApk        = (file, signal) => postMultipart('/api/scan/apk', file, signal);

export async function scanText(text, signal) {
  return fetchWithTimeout(apiUrl('/api/scan/text'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    signal,
  }, 300000, asJson);
}

export async function scanUrl(url, signal) {
  return fetchWithTimeout(apiUrl('/api/scan/url'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
    signal,
  }, 300000, asJson);
}

export async function getJob(jobId, signal) {
  return fetchWithTimeout(apiUrl(`/api/jobs/${encodeURIComponent(jobId)}`), {
    cache: 'no-store',
    signal,
  }, 15000, asJson);
}

export async function getJobComplaint(jobId, signal) {
  return fetchWithTimeout(apiUrl(`/api/jobs/${encodeURIComponent(jobId)}/complaint`), {
    cache: 'no-store',
    signal,
  }, 30000, async (res) => {
    if (!res.ok) throw await readError(res);
    return res.text();
  });
}

/** URL for direct browser download of a completed job's complaint draft. */
export const complaintUrl = (jobId) => apiUrl(`/api/jobs/${encodeURIComponent(jobId)}/complaint`);

/* ── Client-Side Input Validation ────────────────────────────────────────── */

export function validateFile(mode, file) {
  const allowed = LIMITS[mode];
  if (!allowed) return { ok: false, message: `Unsupported scan type: ${mode}.` };
  if (!file) return { ok: false, message: 'Please select a file to analyze.' };

  const fileExt = ext(file.name);
  if (!allowed.includes(fileExt)) {
    return {
      ok: false,
      message: `File format "${fileExt || 'unknown'}" is not supported for ${mode} scans. Accepted formats: ${allowed.join(', ')}.`,
    };
  }
  if (file.size > LIMITS.maxBytes) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      message: `The selected file is ${sizeMb} MB. Maximum upload limit is 100 MB.`,
    };
  }
  if (file.size === 0) {
    return { ok: false, message: 'The selected file is empty (0 bytes).' };
  }
  return { ok: true };
}

export function validateText(text) {
  const trimmed = (text || '').trim();
  if (trimmed.length < LIMITS.minTextChars) {
    return {
      ok: false,
      message: `Text must contain at least ${LIMITS.minTextChars} characters for meaningful analysis.`,
    };
  }
  return { ok: true };
}

export function validateUrl(url) {
  const trimmed = (url || '').trim();
  if (trimmed.length < LIMITS.minUrlChars) {
    return { ok: false, message: 'Please enter a valid website address or domain.' };
  }
  const normalized = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch (_) {
    return { ok: false, message: 'Enter a valid website address or domain (for example, example.com).' };
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname.includes('.')) {
    return { ok: false, message: 'Please enter a complete domain or URL (e.g. https://example.com).' };
  }
  return { ok: true, value: normalized };
}

/* ── Analysis Orchestration & Job Polling ────────────────────────────────── */

/**
 * Initiates and tracks an analysis job across any supported modality.
 * Handles video via backend job polling, and synchronous endpoints with honest progress tracking.
 *
 * @param {'video'|'audio'|'image'|'text'|'url'|'apk'} mode
 * @param {File|string} payload
 * @param {object} handlers
 * @returns {{ cancel: () => void }}
 */
export function startRun(mode, payload, handlers) {
  const plan = planFor(mode);
  const controller = new AbortController();
  let stopped = false;
  let activePollTimeout = null;
  let consecutivePollErrors = 0;
  const startedAt = Date.now();
  const maxRunDurationMs = 15 * 60 * 1000;

  const emit = {
    job: (jobId) => handlers.onJob?.(jobId),
    stage: (index, state) => handlers.onStage?.(index, state),
    status: (text) => handlers.onStatus?.(text),
  };

  const clearPollTimeout = () => {
    if (!activePollTimeout) return;
    clearTimeout(activePollTimeout);
    activePollTimeout = null;
  };

  const finish = (result) => {
    if (stopped) return;
    stopped = true;
    clearPollTimeout();
    handlers.onDone?.(result);
  };

  const fail = (error) => {
    if (stopped) return;
    stopped = true;
    clearPollTimeout();
    if (error?.name === 'AbortError') return;
    handlers.onError?.(error);
  };

  /* ── Video: Asynchronous Job Polling ───────────────────────────────────── */
  async function pollingSource() {
    let jobData;
    try {
      jobData = await createVideoJob(payload, controller.signal);
    } catch (err) {
      return fail(err);
    }

    const jobId = jobData.job_id;
    if (typeof jobId !== 'string' || !jobId.trim()) {
      return fail(new ServiceError('The analysis service returned an invalid job reference.', 502));
    }
    emit.job(jobId);
    emit.status('Video job submitted. Waiting for the backend to report its current stage.');

    const poll = async () => {
      if (stopped) return;

      if (Date.now() - startedAt >= maxRunDurationMs) {
        return fail(new ServiceError('Video analysis exceeded the 15-minute time limit. Please try again.', 408));
      }

      let job;
      try {
        job = await getJob(jobId, controller.signal);
      } catch (err) {
        if (err?.name === 'AbortError') return;
        if (err?.status === 404) return fail(err);
        consecutivePollErrors += 1;
        if (consecutivePollErrors >= 4) {
          return fail(new ServiceError('Network connection to the analysis service was interrupted.', 0));
        }
        const retryDelay = Math.min(10000, 1000 * (2 ** (consecutivePollErrors - 1)));
        activePollTimeout = setTimeout(poll, retryDelay);
        return;
      }
      consecutivePollErrors = 0;

      if (!job || typeof job !== 'object' || typeof job.status !== 'string') {
        return fail(new ServiceError('The analysis service returned an invalid job status.', 502));
      }

      if (job.status === 'completed') {
        if (!job.result || typeof job.result !== 'object') {
          return fail(new ServiceError('The job completed without returning an analysis result.', 502));
        }
        plan.forEach((_, index) => emit.stage(index, 'done'));
        return finish(job.result);
      }

      if (job.status === 'failed') {
        const failedIndex = plan.findIndex((stage) => stage.key === job.stage);
        if (failedIndex >= 0) emit.stage(failedIndex, 'failed');
        const failureMessage = typeof job.error === 'string' && job.error
          ? job.error
          : 'The analysis service could not process this video.';
        return fail(new ServiceError(failureMessage, 500));
      }

      if (job.status === 'processing' && typeof job.stage === 'string') {
        const reportedIndex = plan.findIndex((stage) => stage.key === job.stage);
        if (reportedIndex >= 0) {
          emit.stage(reportedIndex, 'active');
          emit.status(plan[reportedIndex].status);
        } else {
          emit.status('The backend is processing a stage that is not listed in this interface.');
        }
      } else if (job.status === 'processing') {
        emit.status('The backend is processing this video; stage details are not available yet.');
      } else if (job.status === 'queued') {
        emit.status('Video job queued. Waiting for the backend to begin processing.');
      } else if (job.status !== 'processing') {
        return fail(new ServiceError(`The analysis service returned an unknown job status: ${job.status}.`, 502));
      }

      activePollTimeout = setTimeout(poll, 1200);
    };

    activePollTimeout = setTimeout(poll, 1000);
  }

  /* ── Synchronous Endpoints (Audio, Image, Text, URL, APK) ──────────────── */
  function synchronousSource(requestFn) {
    emit.status('Request sent. Waiting for the backend to return its analysis.');

    requestFn(controller.signal)
      .then((result) => {
        if (stopped) return;
        if (!result || typeof result !== 'object') {
          return fail(new ServiceError('The analysis service returned an invalid result.', 502));
        }
        finish(result);
      })
      .catch((err) => {
        fail(err);
      });
  }

  const runMap = {
    video: pollingSource,
    audio: () => synchronousSource((signal) => scanAudio(payload, signal)),
    image: () => synchronousSource((signal) => scanImage(payload, signal)),
    text:  () => synchronousSource((signal) => scanText(payload, signal)),
    url:   () => synchronousSource((signal) => scanUrl(payload, signal)),
    apk:   () => synchronousSource((signal) => scanApk(payload, signal)),
  };

  const execute = runMap[mode] || pollingSource;
  Promise.resolve().then(execute).catch(fail);

  return {
    cancel() {
      if (stopped) return;
      stopped = true;
      clearPollTimeout();
      controller.abort();
    },
  };
}
