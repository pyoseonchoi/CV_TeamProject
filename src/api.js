/**
 * AI 백엔드 연동 어댑터
 *
 * - `.env.local`에 VITE_API_BASE_URL (예: http://localhost:8000)을 설정하면
 *   자동으로 실제 AI 백엔드 API와 통신합니다.
 * - 설정하지 않거나 서버 응답이 없으면 프론트엔드 단독 데모 모드로 동작합니다.
 */

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
export const POLL_INTERVAL_MS = Number(import.meta.env.VITE_POLL_INTERVAL_MS || 1000);
export const IS_API_CONFIGURED = Boolean(API_BASE_URL);

async function requestJson(path, options = {}) {
  if (!API_BASE_URL) return null;
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });
  if (!res.ok) {
    throw new Error(`API ${path} failed with status ${res.status}`);
  }
  return res.json();
}

/**
 * 전체 CCTV 목록 및 실시간 위험도·바운딩박스 조회
 * GET /api/cameras?preset=NIGHT
 * 기대 응답: Camera[] 또는 { cameras: Camera[] }
 */
export async function fetchCameras(weightPreset) {
  const data = await requestJson(`/api/cameras?preset=${encodeURIComponent(weightPreset)}`);
  if (!data) return null;
  return Array.isArray(data) ? data : data.cameras || null;
}

/**
 * 시계열 위험도 추이 데이터 조회
 * GET /api/timeseries?camera_id=CCTV-E02_009
 * 기대 응답: Array<{ s, fall, fight, crowd, group }>
 */
export async function fetchTimeSeries(cameraId) {
  const data = await requestJson(`/api/timeseries?camera_id=${encodeURIComponent(cameraId)}`);
  if (!data) return null;
  return Array.isArray(data) ? data : data.points || null;
}

/**
 * 수동 화질 개선 요청
 * POST /api/enhance
 * Body: { camera_id, mode: "DEHAZE" | "DERAIN" | "LOW_LIGHT" | "SR" }
 */
export async function requestManualEnhance(cameraId, mode) {
  return requestJson('/api/enhance', {
    method: 'POST',
    body: JSON.stringify({ camera_id: cameraId, mode })
  });
}

/**
 * 알람 확인(해제) 처리
 * POST /api/acknowledge
 * Body: { camera_id }
 */
export async function acknowledgeAlarm(cameraId) {
  return requestJson('/api/acknowledge', {
    method: 'POST',
    body: JSON.stringify({ camera_id: cameraId })
  });
}

/**
 * 현장 대응 조치 전송 (119/경찰 호출, VMS 송출, 유지보수 호출)
 * POST /api/actions
 * Body: { camera_id, action }
 */
export async function sendSopAction(cameraId, action) {
  return requestJson('/api/actions', {
    method: 'POST',
    body: JSON.stringify({ camera_id: cameraId, action })
  });
}

/**
 * 백엔드 실측 이벤트 로그 조회 (events.jsonl / run.json 요약)
 * API 미설정 시 로컬 `/backend_data.json` fallback
 */
export async function fetchBackendLogs() {
  if (API_BASE_URL) {
    try {
      const data = await requestJson('/api/logs');
      if (data) return data;
    } catch {
      // fallback to local file
    }
  }
  try {
    const res = await fetch('/backend_data.json');
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
