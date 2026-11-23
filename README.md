# 도로 안전 통합 관제 프론트엔드 (React + Vite + Tailwind + Leaflet)

AI 도로 위험요소 탐지 · 동적 가중치(DSS) 백엔드와 연동하기 위한 관제 대시보드 프론트엔드입니다.  
**가짜 데모 영상(`.mp4`)과 빌드 산출물(`dist/`, `node_modules/`)은 레포에서 제외되어 있으며**, 백엔드 API 주소만 연결하면 실제 CCTV 영상과 실시간 위험도가 즉시 반영됩니다.

---

## 1. 빠른 시작 (개발 서버 실행)

```bash
npm install
cp .env.example .env.local   # Windows PowerShell: Copy-Item .env.example .env.local
npm run dev
```

- 브라우저에서 `http://localhost:5173` 접속
- `.env.local`의 `VITE_API_BASE_URL`이 비어 있으면 **단독 데모 모드(`DEMO`)**로 자동 실행됩니다.
- `VITE_API_BASE_URL=http://localhost:8000` 처럼 AI 백엔드 주소를 넣으면 **실시간 연동 모드(`LIVE API`)**로 전환됩니다.

---

## 2. 백엔드 연동 API 규격 ([src/api.js](src/api.js))

백엔드(FastAPI / Flask 등)에서 아래 엔드포인트를 제공하고 CORS를 허용해 주시면 됩니다.

### ① 실시간 카메라 · 위험도 조회 (필수)
- **Endpoint:** `GET /api/cameras?preset=NIGHT`
- **호출 주기:** 기본 1초 (`VITE_POLL_INTERVAL_MS`로 조절 가능)
- **응답 형식 (`Camera[]` 또는 `{ "cameras": Camera[] }`):**

```json
[
  {
    "id": "CCTV-E02_009",
    "shortId": "E02_009",
    "zone": "중앙네거리",
    "roadType": "general",
    "roadTypeKo": "중앙네거리 횡단보도",
    "subLabel": "중앙네거리 횡단보도",
    "baseRisk": 0.79,
    "finalRisk": "0.98",
    "eventType": "쓰러짐",
    "detailEvent": "횡단보도 내 보행자 쓰러짐 및 66초 정지",
    "level": "L3",
    "elapsed": 66,
    "acknowledged": false,
    "pinned": false,
    "aiStatus": "저조도·대비 보정",
    "aiTechnique": "CLAHE + 엣지 복원",
    "weatherCond": "야간 저조도",
    "reliability": 96,
    "lat": "35.8692",
    "lng": "128.6014",
    "fovAngle": 45,
    "videoUrl": "http://localhost:8000/videos/cam_e02_009.mp4",
    "vmsId": "VMS-02 (전방 횡단보도 보행자 사고 즉시 정차)",
    "sopRecommended": "119 구급대 및 관할 경찰서 즉시 출동 요청",
    "weightFactors": [
      { "label": "보행자 누워있는 포즈", "mult": "x1.45", "cat": "위험유형" }
    ],
    "roiZones": [
      { "name": "횡단보도", "type": "crosswalk", "color": "#eab308", "points": "48,38 78,34 90,72 58,78" }
    ],
    "boxes": [
      { "id": "#11", "cls": "fall_down", "conf": "0.96", "x": 64, "y": 53, "w": 14, "h": 12, "color": "#dc2626", "tag": "쓰러짐 66s" }
    ]
  }
]
```

> **참고:**
> - `level`: `"L3"`(긴급), `"L2"`(주의), `"CAM_WARN"`(화각이탈/탐지율 저하), `"NONE"`(정상)
> - `boxes` 좌표(`x`, `y`, `w`, `h`) 및 `roiZones.points`는 **영상 프레임 대비 0~100 (%) 비율 좌표**입니다.
> - `videoUrl`은 H.264 MP4 URL 또는 스트리밍 URL을 넣어주시면 됩니다. (백엔드에서 이미 박스를 그려낸 영상을 주실 경우, 상단 `객체 박스 OFF`로 프론트 오버레이를 끌 수 있습니다.)

### ② 수동 화질 개선 요청 (선택)
- **Endpoint:** `POST /api/enhance`
- **Request Body:** `{ "camera_id": "CCTV-E02_009", "mode": "DEHAZE" | "DERAIN" | "LOW_LIGHT" | "SR" }`

### ③ 알람 확인 처리 / 현장 조치 기록 (선택)
- `POST /api/acknowledge` — Body: `{ "camera_id": "CCTV-E02_009" }`
- `POST /api/actions` — Body: `{ "camera_id": "CCTV-E02_009", "action": "119 구급대 출동 요청" }`

### ④ 시계열 추이 / 이벤트 로그 (선택)
- `GET /api/timeseries?camera_id=CCTV-E02_009` — 응답: `[{ "s": 0, "fall": 0.05, "fight": 0.04, "crowd": 0.08, "group": 0.05 }, ...]`
- `GET /api/logs` — 응답: `{ "run": {...}, "events": [...], "total_events": 120 }`

---

## 3. FastAPI 연동 최소 예시 (Python 백엔드 참고용)

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 실제 모델 출력 영상 폴더 정적 서빙
app.mount("/videos", StaticFiles(directory="outputs"), name="videos")

@app.get("/api/cameras")
def get_cameras(preset: str = "NIGHT"):
    # AI 모델/위험도 계산 결과를 위 JSON 스키마 리스트로 반환
    return [...]

@app.post("/api/enhance")
def trigger_enhance(payload: dict):
    # payload: {"camera_id": "...", "mode": "LOW_LIGHT"}
    return {"ok": True}
```

---

## 4. 배포용 빌드

```bash
npm run build
```
빌드 완료 후 생성되는 `dist/` 폴더를 FastAPI / Nginx / `python dashboard.py` 등으로 서빙하시면 됩니다.
