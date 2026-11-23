import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  MapPin,
  Activity,
  Lock,
  Unlock,
  Play,
  Pause,
  Maximize2,
  Database,
  X,
  LayoutGrid,
  Monitor,
  SlidersHorizontal
} from 'lucide-react';
import {
  IS_API_CONFIGURED,
  POLL_INTERVAL_MS,
  fetchCameras,
  fetchTimeSeries,
  requestManualEnhance,
  acknowledgeAlarm,
  sendSopAction,
  fetchBackendLogs
} from './api';

// ============================================================================
// 1. 9대 관제 CCTV 초기 데이터 (H.264 MP4 + ROI 구역 + 화질 보정 + 동적 가중치)
// ============================================================================
const INITIAL_CAMERAS = [
  {
    id: 'CCTV-E02_009',
    shortId: 'E02_009',
    zone: '중앙네거리',
    roadType: 'general',
    roadTypeKo: '중앙네거리 횡단보도',
    subLabel: '중앙네거리 횡단보도',
    baseRisk: 0.79,
    eventType: '쓰러짐',
    hazardCode: 'person_stopped_on_road',
    detailEvent: '횡단보도 내 보행자 쓰러짐(누운 포즈) 및 66초 정지',
    objectCategory: '보행자 (누운 포즈 · 최고위험등급)',
    level: 'L3',
    elapsed: 66,
    acknowledged: false,
    pinned: false,
    aiStatus: '저조도·대비 보정',
    aiTechnique: '야간 적응형 히스토그램 평활화(CLAHE) + 엣지 복원',
    weatherCond: '야간 역광 · 저조도',
    rawFilter: 'brightness(0.58) contrast(0.72) blur(0.8px)',
    enhancedFilter: 'brightness(1.1) contrast(1.22)',
    reliability: 96,
    camState: '정상 작동',
    lat: '35.8692',
    lng: '128.6014',
    mapPos: { x: 52, y: 46 },
    fovAngle: 45,
    videoUrl: '/videos/cam_e02_009.mp4',
    posterUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=900&q=80',
    weightFactors: [
      { label: '보행자 누워있는 포즈', mult: 'x1.45', cat: '위험유형' },
      { label: '횡단보도 내부 정지', mult: 'x1.30', cat: '장소특성' },
      { label: '심야 시간대 가중', mult: 'x1.25', cat: '시간대' }
    ],
    vmsId: 'VMS-02 (전방 횡단보도 보행자 사고 즉시 정차)',
    sopRecommended: '119 구급대 및 관할 경찰서 즉시 출동 요청 (최우선)',
    roiZones: [
      { name: '횡단보도', type: 'crosswalk', color: '#eab308', points: '48,38 78,34 90,72 58,78' },
      { name: '차로', type: 'roadway', color: '#3b82f6', points: '10,32 95,28 95,90 10,88' }
    ],
    boxes: [
      { id: '#04', cls: 'truck', conf: '0.95', x: 78, y: 12, w: 14, h: 18, color: '#6b7280', tag: 'STOP 18s' },
      { id: '#08', cls: 'person', conf: '0.92', x: 52, y: 44, w: 7, h: 22, color: '#16a34a', tag: '' },
      { id: '#11', cls: 'fall_down', conf: '0.96', x: 64, y: 53, w: 14, h: 12, color: '#dc2626', tag: '쓰러짐 66s' }
    ]
  },
  {
    id: 'CCTV-E05_006',
    shortId: 'E05_006',
    zone: '상업지역',
    roadType: 'general',
    roadTypeKo: '상업 보행밀집 도로',
    subLabel: '보행밀집·이면도로 교차점',
    baseRisk: 0.82,
    eventType: '인파밀집',
    hazardCode: 'sidewalk_obstacle',
    detailEvent: '보행로 입간판 적치물 방치 및 야간 인파 병목',
    objectCategory: '장애물·적치물 + 보행자 군집',
    level: 'L3',
    elapsed: 14,
    acknowledged: false,
    pinned: false,
    aiStatus: '저조도·노이즈 보정',
    aiTechnique: '야간 밝기 증폭(Retinex) + 다중프레임 디노이징',
    weatherCond: '심야 저조도 (8 lux)',
    rawFilter: 'brightness(0.55) contrast(0.78) saturate(0.7) blur(0.6px)',
    enhancedFilter: 'brightness(1.12) contrast(1.18) saturate(1.15)',
    reliability: 94,
    camState: '정상 작동',
    lat: '35.8714',
    lng: '128.5952',
    mapPos: { x: 28, y: 32 },
    fovAngle: 135,
    videoUrl: '/videos/cam_e05_006.mp4',
    posterUrl: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=900&q=80',
    weightFactors: [
      { label: '심야 상업지구 보행밀집', mult: 'x1.15', cat: '시간대' },
      { label: '입간판 적치물 (STOP 45s)', mult: 'x1.15', cat: '위험유형' }
    ],
    vmsId: 'VMS-05 (전방 보행자 밀집·적치물 서행)',
    sopRecommended: '도로관리과 적치물 이동 조치 및 순찰차 현장 계도',
    roiZones: [
      { name: '보도구역', type: 'sidewalk', color: '#16a34a', points: '8,18 52,18 58,92 4,92' },
      { name: '차로구역', type: 'roadway', color: '#3b82f6', points: '53,20 96,20 96,94 59,94' }
    ],
    boxes: [
      { id: '#12', cls: 'person', conf: '0.94', x: 18, y: 28, w: 8, h: 28, color: '#16a34a', tag: '' },
      { id: '#19', cls: 'crowd_zone', conf: '0.99', x: 14, y: 22, w: 36, h: 58, color: '#dc2626', tag: '인파밀집' },
      { id: '#24', cls: 'sign_board', conf: '0.89', x: 63, y: 56, w: 12, h: 22, color: '#d97706', tag: 'STOP 45s' }
    ]
  },
  {
    id: 'CCTV-E06_058',
    shortId: 'E06_058',
    zone: '저지대',
    roadType: 'expressway',
    roadTypeKo: '신천변 하상 고속화도로',
    subLabel: '신천변 하상도로 저지대',
    baseRisk: 0.74,
    eventType: '노면침수',
    hazardCode: 'road_obstacle',
    detailEvent: '폭우 노면 침수 및 차로 내 대형 부유 적치물 방치',
    objectCategory: '도로 침수 + 차로 적치물(debris)',
    level: 'L3',
    elapsed: 24,
    acknowledged: false,
    pinned: false,
    aiStatus: '빗줄기 제거',
    aiTechnique: 'De-raining 신경망 빗줄기 제거 + 수면 반사 억제',
    weatherCond: '국지성 호우 (35mm/h)',
    rawFilter: 'brightness(0.68) contrast(0.70) blur(1.2px) hue-rotate(10deg)',
    enhancedFilter: 'brightness(1.06) contrast(1.18) saturate(1.08)',
    reliability: 91,
    camState: '정상 작동',
    lat: '35.8755',
    lng: '128.6120',
    mapPos: { x: 76, y: 28 },
    fovAngle: 180,
    videoUrl: '/videos/cam_e06_058.mp4',
    posterUrl: 'https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?auto=format&fit=crop&w=900&q=80',
    weightFactors: [
      { label: '저지대 상습침수 구간', mult: 'x1.30', cat: '장소특성' },
      { label: '차로 부유 적치물 추돌 위험', mult: 'x1.25', cat: '위험유형' }
    ],
    vmsId: 'VMS-08 (하상도로 침수 및 낙하물 진입통제·우회)',
    sopRecommended: 'VMS 진입통제 송출 및 배수펌프·유지보수팀 투입',
    roiZones: [
      { name: '침수차로', type: 'roadway', color: '#dc2626', points: '22,42 96,38 96,95 8,95' }
    ],
    boxes: [
      { id: '#31', cls: 'flooded_road', conf: '0.91', x: 24, y: 44, w: 66, h: 48, color: '#dc2626', tag: '노면침수' },
      { id: '#33', cls: 'debris_box', conf: '0.87', x: 71, y: 62, w: 11, h: 13, color: '#d97706', tag: 'STOP 28s' }
    ]
  },
  {
    id: 'CCTV-E04_070',
    shortId: 'E04_070',
    zone: '산단진입로',
    roadType: 'industrial_access',
    roadTypeKo: '산업단지 진입 간선도로',
    subLabel: '산단 진입로 화물차 구간',
    baseRisk: 0.71,
    eventType: '화물낙하물',
    hazardCode: 'road_obstacle',
    detailEvent: '화물차 적재물(대형 박스) 차로 낙하 및 보행자 차도 진입',
    objectCategory: '화물차 낙하물(box) + 차로 보행자',
    level: 'L3',
    elapsed: 53,
    acknowledged: false,
    pinned: false,
    aiStatus: '저조도 보정',
    aiTechnique: '야간 저조도 감마 최적화 + 움직임 블러 보정',
    weatherCond: '야간 간선도로',
    rawFilter: 'brightness(0.62) contrast(0.80)',
    enhancedFilter: 'brightness(1.08) contrast(1.16)',
    reliability: 92,
    camState: '정상 작동',
    lat: '35.8658',
    lng: '128.5890',
    mapPos: { x: 22, y: 62 },
    fovAngle: 60,
    videoUrl: '/videos/cam_e04_070.mp4',
    posterUrl: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=900&q=80',
    weightFactors: [
      { label: '산단 진입로 화물 낙하물', mult: 'x1.35', cat: '장소특성' },
      { label: '2차 추돌 방지 VMS 연동', mult: 'x1.20', cat: '위험유형' }
    ],
    vmsId: 'VMS-04 (2차로 화물 낙하물 주의·차선 변경)',
    sopRecommended: 'VMS 실시간 경고 송출 및 도로순찰대 낙하물 수거',
    roiZones: [
      { name: '산단차로', type: 'roadway', color: '#3b82f6', points: '15,28 92,22 96,94 8,94' }
    ],
    boxes: [
      { id: '#51', cls: 'person', conf: '0.89', x: 28, y: 40, w: 6, h: 20, color: '#16a34a', tag: '' },
      { id: '#55', cls: 'cargo_box', conf: '0.93', x: 55, y: 55, w: 12, h: 13, color: '#dc2626', tag: '낙하물 53s' }
    ]
  },
  {
    id: 'CCTV-E06_060',
    shortId: 'E06_060',
    zone: '노인보호구역',
    roadType: 'elderly_zone',
    roadTypeKo: '노인보호구역 주택가 이면도로',
    subLabel: '주택가 이면도로 교차로',
    baseRisk: 0.73,
    eventType: '시야가림주차',
    hazardCode: 'crosswalk_vehicle',
    detailEvent: '보호구역 코너 불법주정차 시야가림 및 적치물 방치',
    objectCategory: '불법 정차 차량 + 시야가림 적치물',
    level: 'L2',
    elapsed: 39,
    acknowledged: false,
    pinned: false,
    aiStatus: '적외선·초해상화',
    aiTechnique: '노후 IR 카메라 초해상화(SR x2) + 대비 보정',
    weatherCond: '심야 무조명 골목 (IR)',
    rawFilter: 'grayscale(1) brightness(0.65) contrast(0.72) blur(1.1px)',
    enhancedFilter: 'grayscale(1) brightness(1.08) contrast(1.28)',
    reliability: 89,
    camState: '정상 (IR 보정중)',
    lat: '35.8640',
    lng: '128.6088',
    mapPos: { x: 66, y: 70 },
    fovAngle: 90,
    videoUrl: '/videos/cam_e06_060.mp4',
    posterUrl: 'https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?auto=format&fit=crop&w=900&q=80',
    weightFactors: [
      { label: '노인보호구역 시야가림 가중', mult: 'x1.30', cat: '장소특성' },
      { label: '심야 골목 정지 객체', mult: 'x1.18', cat: '시간대' }
    ],
    vmsId: 'VMS-06 (이면도로 시야가림 서행)',
    sopRecommended: '보호구역 불법주정차 단속 알림 및 현장 계도',
    roiZones: [
      { name: '이면도로', type: 'roadway', color: '#3b82f6', points: '18,35 94,35 94,95 10,95' }
    ],
    boxes: [
      { id: '#41', cls: 'obstacle_box', conf: '0.88', x: 53, y: 67, w: 9, h: 13, color: '#d97706', tag: 'STOP 95s' },
      { id: '#42', cls: 'car_blocking', conf: '0.92', x: 64, y: 58, w: 31, h: 34, color: '#dc2626', tag: '시야가림 정차' }
    ]
  },
  {
    id: 'CCTV-E04_065',
    shortId: 'E04_065',
    zone: '어린이보호구역',
    roadType: 'school_zone',
    roadTypeKo: '초등학교 북측 어린이보호구역',
    subLabel: '초등학교 북측 횡단보도',
    baseRisk: 0.69,
    eventType: '킥보드방치',
    hazardCode: 'crosswalk_obstacle',
    detailEvent: '어린이보호구역 횡단보도 내부 전동킥보드 무단 방치',
    objectCategory: '개인형 이동장치 (e-scooter)',
    level: 'L2',
    elapsed: 249,
    acknowledged: false,
    pinned: false,
    aiStatus: '원본 양호 (생략)',
    aiTechnique: '화질 정상 판정 — 선택적 보정 생략',
    weatherCond: '주간/박명 시야 양호',
    rawFilter: 'none',
    enhancedFilter: 'contrast(1.05)',
    reliability: 95,
    camState: '정상 작동',
    lat: '35.8615',
    lng: '128.5970',
    mapPos: { x: 40, y: 78 },
    fovAngle: 15,
    videoUrl: '/videos/cam_e04_065.mp4',
    posterUrl: 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?auto=format&fit=crop&w=900&q=80',
    weightFactors: [
      { label: '어린이보호구역 민감도 상향', mult: 'x1.25', cat: '장소특성' },
      { label: '횡단보도 방치 장애물', mult: 'x1.15', cat: '위험유형' }
    ],
    vmsId: 'VMS-01 (어린이보호구역 횡단보도 장애물 주의)',
    sopRecommended: '공유PM 업체 수거 요청 및 관제 확인',
    roiZones: [
      { name: '횡단보도', type: 'crosswalk', color: '#eab308', points: '46,44 74,40 85,68 56,74' }
    ],
    boxes: [
      { id: '#71', cls: 'kickboard', conf: '0.88', x: 57, y: 56, w: 13, h: 14, color: '#d97706', tag: '횡단보도방치 249s' }
    ]
  },
  {
    id: 'CCTV-E02_045',
    shortId: 'E02_045',
    zone: '공사구간',
    roadType: 'general',
    roadTypeKo: '역전 교차로 도로공사 구간',
    subLabel: '역전 교차로 도로공사 구간',
    baseRisk: 0.65,
    eventType: '시설물이탈',
    hazardCode: 'construction_out_of_zone',
    detailEvent: '공사구간 안전망/라바콘 전도 및 주행 차선 침범(moved)',
    objectCategory: '공사 시설물 (차선 침범)',
    level: 'L2',
    elapsed: 18,
    acknowledged: false,
    pinned: false,
    aiStatus: '선명도·노이즈 보정',
    aiTechnique: '노후 CCTV 샤프닝 및 윤곽선 복원',
    weatherCond: '야간 공사장 역광',
    rawFilter: 'brightness(0.70) contrast(0.76) blur(0.7px)',
    enhancedFilter: 'brightness(1.06) contrast(1.18)',
    reliability: 90,
    camState: '정상 작동',
    lat: '35.8732',
    lng: '128.6045',
    mapPos: { x: 60, y: 30 },
    fovAngle: 210,
    videoUrl: '/videos/cam_e02_045.mp4',
    posterUrl: 'https://images.unsplash.com/photo-1517524008697-84bbe3c3fd98?auto=format&fit=crop&w=900&q=80',
    weightFactors: [
      { label: '도로 공사구간 치사율 가중', mult: 'x1.30', cat: '장소특성' },
      { label: '작업구역 밖 차선 침범', mult: 'x1.25', cat: '위험유형' }
    ],
    vmsId: 'VMS-03 (전방 공사구간 안전시설물 차선침범 주의)',
    sopRecommended: '정상 구역 시설물 유지, 차선 침범 라바콘 현장 복구 지시',
    roiZones: [
      { name: '공사구역(정상)', type: 'work_zone', color: '#ea580c', points: '12,36 46,38 46,54 12,52' },
      { name: '주행차로', type: 'roadway', color: '#3b82f6', points: '12,53 95,45 95,94 12,94' }
    ],
    boxes: [
      { id: '#61', cls: 'cone_managed', conf: '0.90', x: 19, y: 40, w: 24, h: 10, color: '#16a34a', tag: '정상' },
      { id: '#64', cls: 'cone_fallen', conf: '0.89', x: 52, y: 56, w: 14, h: 12, color: '#dc2626', tag: '차선침범' }
    ]
  },
  {
    id: 'CCTV-E03_029',
    shortId: 'E03_029',
    zone: '근린공원',
    roadType: 'general',
    roadTypeKo: '근린공원 보행로·교차로',
    subLabel: '근린공원 보행로',
    baseRisk: 0.38,
    eventType: '단순적치물',
    hazardCode: 'sidewalk_obstacle',
    detailEvent: '보도 가장자리 일반 쓰레기봉투 (인명위험 없음 · 목록만 기록)',
    objectCategory: '소형 일반 적치물',
    level: 'NONE',
    elapsed: 117,
    acknowledged: true,
    pinned: false,
    aiStatus: '원본 양호 (대기)',
    aiTechnique: '선택적 보정 미적용',
    weatherCond: '맑음 (시정 양호)',
    rawFilter: 'none',
    enhancedFilter: 'none',
    reliability: 97,
    camState: '정상 작동',
    lat: '35.8680',
    lng: '128.5920',
    mapPos: { x: 35, y: 52 },
    fovAngle: 300,
    videoUrl: '/videos/cam_e03_029.mp4',
    posterUrl: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=900&q=80',
    weightFactors: [
      { label: '일반 쓰레기봉투 판정 (팝업 생략)', mult: 'x0.60', cat: '알림피로방지' }
    ],
    vmsId: 'VMS-07 (정상 소통)',
    sopRecommended: '긴급 출동 불필요 (관제 확인용 로그에만 자동 기록)',
    roiZones: [
      { name: '보도', type: 'sidewalk', color: '#16a34a', points: '10,45 90,45 90,92 10,92' }
    ],
    boxes: [
      { id: '#81', cls: 'person', conf: '0.91', x: 35, y: 42, w: 6, h: 22, color: '#3b82f6', tag: '' },
      { id: '#82', cls: 'trash_bag', conf: '0.78', x: 74, y: 66, w: 6, h: 8, color: '#6b7280', tag: '목록기록' }
    ]
  },
  {
    id: 'CCTV-E01_052',
    shortId: 'E01_052',
    zone: '초등정문',
    roadType: 'school_zone',
    roadTypeKo: '초등학교 정문 앞 (노후카메라)',
    subLabel: '초등학교 정문',
    baseRisk: 0.02,
    eventType: '화각이탈',
    hazardCode: 'camera_fault',
    detailEvent: '강풍으로 인한 카메라 화각 이탈(+14.5°) 및 짙은 안개로 탐지율 26% 저하',
    objectCategory: '카메라 상태 이상 (자동 탐지 일시 중지)',
    level: 'CAM_WARN',
    elapsed: 58,
    acknowledged: false,
    pinned: false,
    aiStatus: '디헤이징 한계초과',
    aiTechnique: '디헤이징 적용 후에도 물리적 화각 이탈로 탐지율 30% 미만',
    weatherCond: '짙은 안개 · 강풍(14m/s)',
    rawFilter: 'brightness(1.15) contrast(0.45) blur(2.2px)',
    enhancedFilter: 'brightness(1.02) contrast(0.88) blur(0.6px)',
    reliability: 26,
    camState: '화각이탈 · 26%',
    lat: '35.8765',
    lng: '128.5860',
    mapPos: { x: 16, y: 20 },
    fovAngle: 240,
    videoUrl: '/videos/cam_e01_052.mp4',
    posterUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=900&q=80',
    weightFactors: [
      { label: '탐지율 30% 미만 (수동 전환 경고)', mult: 'MAX', cat: '기상/품질' },
      { label: '강풍 화각 이탈 (오탐 방지 중지)', mult: '0', cat: '오탐방지' },
      { label: '유지보수 부서 복구 호출', mult: '100', cat: '장비점검' }
    ],
    vmsId: 'VMS-09 (어린이보호구역 안개 서행)',
    sopRecommended: '자동 탐지 일시 중지 + 수동 모니터링 전환 및 유지보수팀 파견',
    roiZones: [],
    boxes: []
  }
];

const HISTORICAL_LOGS = [
  { id: 'h1', level: 'L3', type: '횡단보도 쓰러짐', cam: 'E02_009', time: '208s 전', note: '119 구급대 출동 완료' },
  { id: 'h2', level: 'L2', type: '전동킥보드 방치', cam: 'E04_065', time: '117s 전', note: '공유PM 수거 업체 전달' },
  { id: 'h3', level: 'L3', type: '산단 화물 낙하물', cam: 'E04_070', time: '58s 전', note: 'VMS-04 전광판 송출됨' },
  { id: 'h4', level: 'INFO', type: '보도 일반 쓰레기봉투', cam: 'E03_029', time: '15s 전', note: '목록만 기록 (알람 생략)' }
];

const CHART_POINTS = [
  { s: 0, fall: 0.05, fight: 0.04, crowd: 0.08, group: 0.05 },
  { s: 12, fall: 0.06, fight: 0.14, crowd: 0.12, group: 0.28 },
  { s: 25, fall: 0.05, fight: 0.12, crowd: 0.15, group: 0.42 },
  { s: 31, fall: 0.08, fight: 0.10, crowd: 0.18, group: 0.75 },
  { s: 46, fall: 0.06, fight: 0.15, crowd: 0.14, group: 0.12 },
  { s: 52, fall: 0.12, fight: 0.56, crowd: 0.20, group: 0.10 },
  { s: 58, fall: 0.18, fight: 0.64, crowd: 0.22, group: 0.08 },
  { s: 67, fall: 0.96, fight: 0.12, crowd: 0.25, group: 0.06 },
  { s: 77, fall: 0.42, fight: 0.08, crowd: 0.20, group: 0.05 },
  { s: 82, fall: 0.98, fight: 0.06, crowd: 0.18, group: 0.05 },
  { s: 89, fall: 0.94, fight: 0.05, crowd: 0.16, group: 0.04 },
  { s: 92, fall: 0.99, fight: 0.05, crowd: 0.15, group: 0.04 },
  { s: 107, fall: 0.68, fight: 0.04, crowd: 0.12, group: 0.04 },
  { s: 123, fall: 0.24, fight: 0.04, crowd: 0.10, group: 0.03 },
  { s: 150, fall: 0.08, fight: 0.03, crowd: 0.08, group: 0.03 }
];

const NAV_ITEMS = [
  { id: 'MONITOR', label: '영상 관제', icon: Monitor },
  { id: 'GIS', label: 'GIS 공간 지도', icon: MapPin },
  { id: 'QUALITY', label: '화질 보정 · 장비 진단', icon: SlidersHorizontal },
  { id: 'ANALYTICS', label: '동적 가중치 · 시계열', icon: Activity },
  { id: 'BACKEND', label: '이벤트 로그 · 실측', icon: Database }
];

const WEIGHT_PRESETS = [
  {
    id: 'NIGHT',
    code: 'MODE 01',
    label: '심야 · 새벽 집중',
    shortDesc: '쓰러짐·소형 적치물 가중치 최대 상향'
  },
  {
    id: 'RUSH',
    code: 'MODE 02',
    label: '출퇴근 혼잡',
    shortDesc: '대형 장애물·화물 낙하물 집중, 소형 적치물 하향'
  },
  {
    id: 'RAIN',
    code: 'MODE 03',
    label: '폭우 · 악천후',
    shortDesc: '빗줄기 제거 선적용 · 침수 구간 최우선'
  },
  {
    id: 'WIND',
    code: 'MODE 04',
    label: '태풍 · 강풍 특보',
    shortDesc: '화각이탈 탐지 중지 및 유지보수 최우선'
  },
  {
    id: 'NORMAL',
    code: 'MODE 05',
    label: '평시 표준 운영',
    shortDesc: '기본 가중치(x1.0) 표준 모니터링'
  }
];

const MANUAL_ENHANCE_MODES = [
  {
    id: 'DEHAZE',
    title: '안개·연무 제거',
    desc: '디헤이징 + 대비 복원',
    filter: 'brightness(1.05) contrast(1.34) saturate(1.18)'
  },
  {
    id: 'DERAIN',
    title: '빗줄기·눈 제거',
    desc: 'De-raining + 반사 억제',
    filter: 'brightness(1.10) contrast(1.26) saturate(1.14)'
  },
  {
    id: 'LOW_LIGHT',
    title: '야간 저조도 증폭',
    desc: 'Retinex + 노이즈 제거',
    filter: 'brightness(1.24) contrast(1.24) saturate(1.12)'
  },
  {
    id: 'SR',
    title: '노후 초해상화',
    desc: 'Super-Resolution x2',
    filter: 'brightness(1.08) contrast(1.32) saturate(1.08)'
  }
];

export default function App() {
  const [activeMenu, setActiveMenu] = useState('MONITOR');
  const [monitorViewMode, setMonitorViewMode] = useState('FOCUS_4');

  const [cameras, setCameras] = useState(INITIAL_CAMERAS);
  const [selectedCamId, setSelectedCamId] = useState('CCTV-E02_009');
  const [weightPreset, setWeightPreset] = useState('NIGHT');
  const [systemTime, setSystemTime] = useState(250);
  const [cycleTimer, setCycleTimer] = useState(10);
  const [rotationStep, setRotationStep] = useState(0);
  const [autoRotateEnabled, setAutoRotateEnabled] = useState(true);

  const [showBboxes, setShowBboxes] = useState(true);
  const [showRoiZones, setShowRoiZones] = useState(true);
  const [globalAiEnhance, setGlobalAiEnhance] = useState(true);

  const [splitSliderPos, setSplitSliderPos] = useState(50);
  const [inspectModalCamId, setInspectModalCamId] = useState(null);
  const [selectedEnhanceMode, setSelectedEnhanceMode] = useState('LOW_LIGHT');
  const [enhancingCamId, setEnhancingCamId] = useState(null);

  const [mapLayers, setMapLayers] = useState({
    heatmap: true,
    fov: true,
    floodZone: true
  });

  const [chartCursor, setChartCursor] = useState(92);
  const [chartPoints, setChartPoints] = useState(CHART_POINTS);
  const [backendData, setBackendData] = useState(null);
  const [backendFilter, setBackendFilter] = useState('ALL');
  const [apiConnected, setApiConnected] = useState(false);

  const [actionLogs, setActionLogs] = useState([
    {
      id: 1,
      time: '250s',
      msg: '시스템 가동 완료 · RF-DETR Nano + ByteTrack + 동적 가중치(DSS) 활성',
      type: 'info'
    }
  ]);
  const [noticeBanner, setNoticeBanner] = useState(null);

  const pushNotice = (msg, type = 'info') => {
    setActionLogs((prev) => [{ id: Date.now(), time: `${systemTime}s`, msg, type }, ...prev.slice(0, 19)]);
  };

  const showToast = (title, cam, detail, severity = 'info') => {
    setNoticeBanner({ title, cam, detail, severity });
    setTimeout(() => setNoticeBanner(null), 4000);
  };

  const handleManualEnhanceRequest = async (targetCam = selectedCam, modeId = selectedEnhanceMode) => {
    const mode = MANUAL_ENHANCE_MODES.find((m) => m.id === modeId) || MANUAL_ENHANCE_MODES[2];
    setEnhancingCamId(targetCam.id);
    setGlobalAiEnhance(true);
    pushNotice(`[수동 보정 요청] ${targetCam.id} — '${mode.title}' 처리 시작`, 'info');

    try {
      if (IS_API_CONFIGURED) {
        await requestManualEnhance(targetCam.id, mode.id);
      }
    } catch {
      // 백엔드 미연결 시 로컬 프리뷰 보정으로 계속 진행
    }

    setTimeout(() => {
      setCameras((prev) =>
        prev.map((c) => {
          if (c.id !== targetCam.id) return c;
          const nextRel = c.level === 'CAM_WARN' ? Math.min(45, c.reliability + 8) : Math.min(99, c.reliability + 3);
          return {
            ...c,
            aiStatus: `수동보정 · ${mode.title}`,
            aiTechnique: `[수동 요청] ${mode.title} (${mode.desc})`,
            enhancedFilter: mode.filter,
            reliability: nextRel
          };
        })
      );
      setEnhancingCamId(null);
      pushNotice(`[수동 보정 완료] ${targetCam.id} — '${mode.title}' 적용됨`, 'success');
      showToast(
        `수동 화질 보정 완료 (${mode.title})`,
        `${targetCam.id} · ${targetCam.subLabel}`,
        `${mode.desc} 필터가 영상에 즉시 적용되었습니다.`,
        'info'
      );
    }, 500);
  };

  // 백엔드 실시간 카메라/위험도 폴링 (VITE_API_BASE_URL 설정 시 활성화)
  useEffect(() => {
    if (!IS_API_CONFIGURED) return;
    let alive = true;
    const syncCameras = async () => {
      try {
        const remote = await fetchCameras(weightPreset);
        if (alive && remote && remote.length > 0) {
          setCameras(remote);
          setApiConnected(true);
        }
      } catch {
        if (alive) setApiConnected(false);
      }
    };
    syncCameras();
    const timer = setInterval(syncCameras, POLL_INTERVAL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [weightPreset]);

  // 백엔드 시계열 데이터 조회
  useEffect(() => {
    if (!IS_API_CONFIGURED) return;
    fetchTimeSeries(selectedCamId)
      .then((pts) => {
        if (pts && pts.length > 0) setChartPoints(pts);
      })
      .catch(() => {});
  }, [selectedCamId]);

  // 백엔드 이벤트 로그(events.jsonl / run.json) 로드
  useEffect(() => {
    fetchBackendLogs().then((data) => {
      if (data) setBackendData(data);
    });
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setSystemTime((t) => t + 1);
      setCameras((prev) =>
        prev.map((c) => (!c.acknowledged && (c.level === 'L3' || c.level === 'L2') ? { ...c, elapsed: c.elapsed + 1 } : c))
      );
      if (autoRotateEnabled) {
        setCycleTimer((c) => {
          if (c <= 1) {
            setRotationStep((s) => s + 1);
            return 10;
          }
          return c - 1;
        });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [autoRotateEnabled]);

  const sortedCameras = useMemo(() => {
    const scored = cameras.map((cam) => {
      // 실제 AI 백엔드에서 finalRisk를 직접 계산해 내려준 경우 그대로 사용
      if (apiConnected && cam.finalRisk !== undefined && cam.finalRisk !== null) {
        return { ...cam, finalRisk: Number(cam.finalRisk).toFixed(2) };
      }
      if (cam.level === 'CAM_WARN') {
        const warnScore = weightPreset === 'WIND' || weightPreset === 'RAIN' ? '0.97' : '0.02';
        return { ...cam, finalRisk: warnScore };
      }
      let mult = 1.15;
      if (weightPreset === 'NIGHT') {
        if (cam.eventType === '쓰러짐') mult = 1.24;
        else if (cam.eventType === '인파밀집') mult = 1.21;
        else if (cam.eventType === '킥보드방치') mult = 1.25;
        else mult = 1.2;
      } else if (weightPreset === 'RAIN') {
        if (cam.eventType === '노면침수') mult = 1.34;
        else mult = 1.08;
      } else if (weightPreset === 'RUSH') {
        if (cam.eventType === '화물낙하물' || cam.eventType === '시설물이탈') mult = 1.38;
        else if (cam.eventType === '킥보드방치') mult = 0.95;
        else mult = 1.12;
      } else if (weightPreset === 'WIND') {
        mult = 1.05;
      } else {
        mult = 1.0;
      }

      if (cam.acknowledged && cam.level === 'NONE') {
        return { ...cam, finalRisk: Math.min(0.45, cam.baseRisk).toFixed(2) };
      }

      const score = Math.min(0.99, cam.baseRisk * mult).toFixed(2);
      return { ...cam, finalRisk: score };
    });

    const unacked = scored
      .filter((c) => c.pinned || (!c.acknowledged && (c.level === 'L3' || c.level === 'L2')) || (weightPreset === 'WIND' && c.level === 'CAM_WARN'))
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return parseFloat(b.finalRisk) - parseFloat(a.finalRisk);
      });

    const standby = scored
      .filter((c) => !unacked.some((u) => u.id === c.id))
      .sort((a, b) => parseFloat(b.finalRisk) - parseFloat(a.finalRisk));

    if (standby.length > 1 && rotationStep > 0) {
      const shift = rotationStep % standby.length;
      const rotatedStandby = [...standby.slice(shift), ...standby.slice(0, shift)];
      return [...unacked, ...rotatedStandby];
    }

    return [...unacked, ...standby];
  }, [cameras, weightPreset, rotationStep, apiConnected]);

  const selectedCam = useMemo(
    () => sortedCameras.find((c) => c.id === selectedCamId) || sortedCameras[0],
    [sortedCameras, selectedCamId]
  );

  const inspectModalCam = useMemo(
    () => (inspectModalCamId ? sortedCameras.find((c) => c.id === inspectModalCamId) : null),
    [sortedCameras, inspectModalCamId]
  );

  const l3Count = sortedCameras.filter((c) => c.level === 'L3' && !c.acknowledged).length;
  const l2Count = sortedCameras.filter((c) => c.level === 'L2' && !c.acknowledged).length;
  const camWarnCount = sortedCameras.filter((c) => c.level === 'CAM_WARN').length;

  const handleSopAction = (actionLabel, targetCam = selectedCam) => {
    if (IS_API_CONFIGURED) {
      sendSopAction(targetCam.id, actionLabel).catch(() => {});
    }
    const msg = `[조치 전송] ${targetCam.id} (${targetCam.subLabel}) — ${actionLabel}`;
    pushNotice(msg, 'success');
    showToast(
      actionLabel,
      `${targetCam.id} · ${targetCam.subLabel}`,
      `${targetCam.detailEvent} (위험도 ${targetCam.finalRisk})`,
      actionLabel.includes('119') ? 'critical' : 'info'
    );
  };

  const handleAcknowledge = (camId, e) => {
    if (e) e.stopPropagation();
    if (IS_API_CONFIGURED) {
      acknowledgeAlarm(camId).catch(() => {});
    }
    setCameras((prev) =>
      prev.map((c) =>
        c.id === camId ? { ...c, acknowledged: true, pinned: false, baseRisk: 0.32, level: 'NONE' } : c
      )
    );
    pushNotice(`[확인 처리] ${camId} 알람 해제 · 차순위 대기 채널 자동 배정`, 'info');
  };

  const togglePinCamera = (camId, e) => {
    if (e) e.stopPropagation();
    setCameras((prev) =>
      prev.map((c) => (c.id === camId ? { ...c, pinned: !c.pinned } : c))
    );
  };

  const resetAllAlarms = () => {
    setCameras(INITIAL_CAMERAS);
    setRotationStep(0);
    setCycleTimer(10);
    pushNotice('[초기화] 전체 9채널 알람 및 가중치 초기 상태 복원', 'info');
  };

  const simulateFallSpike = () => {
    setCameras((prev) =>
      prev.map((c) =>
        c.id === 'CCTV-E02_009'
          ? {
              ...c,
              baseRisk: 0.85,
              level: 'L3',
              acknowledged: false,
              pinned: true,
              elapsed: 1,
              eventType: '쓰러짐',
              detailEvent: '횡단보도 보행자 쓰러짐 발생 (누운 포즈 · 위험도 0.99)'
            }
          : c
      )
    );
    setSelectedCamId('CCTV-E02_009');
    pushNotice('[긴급 감지] CCTV-E02_009 보행자 쓰러짐 (위험도 0.99) · K=1 최우선 배정', 'critical');
    showToast(
      '긴급 L3 감지: 횡단보도 보행자 쓰러짐',
      'CCTV-E02_009 · 중앙네거리 횡단보도',
      '위험도 0.99 · 관제 화면 1순위(K1) 자동 배정 완료',
      'critical'
    );
  };

  const monitoredCameras = sortedCameras.slice(0, 4);
  const standbyCameras = sortedCameras.slice(4);

  return (
    <div className="min-h-screen bg-[#0f1114] text-[#f1f3f5] flex select-none">
      {/* ==================== 우측 상단 알림 토스트 (차분한 관제형 배너) ==================== */}
      {noticeBanner && (
        <div
          className={`fixed top-5 right-6 z-50 bg-[#1c1f24] border border-[#343a44] border-l-4 ${
            noticeBanner.severity === 'critical' ? 'border-l-[#dc2626]' : 'border-l-[#2563eb]'
          } shadow-2xl px-5 py-3.5 rounded-md flex items-start justify-between gap-4 max-w-md`}
        >
          <div className="min-w-0">
            <div
              className={`text-sm font-bold ${
                noticeBanner.severity === 'critical' ? 'text-[#f87171]' : 'text-[#60a5fa]'
              }`}
            >
              {noticeBanner.title}
            </div>
            <div className="text-sm font-semibold text-[#f1f3f5] mt-0.5">{noticeBanner.cam}</div>
            <div className="text-xs text-[#9ca3af] mt-0.5">{noticeBanner.detail}</div>
          </div>
          <button
            onClick={() => setNoticeBanner(null)}
            className="p-1 text-[#717885] hover:text-white rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ==================== 좌측 고정 사이드바 (실무형 무채색 레일) ==================== */}
      <aside className="w-64 bg-[#15171b] border-r border-[#262a32] flex flex-col justify-between shrink-0">
        <div>
          {/* 시스템 헤더 */}
          <div className="h-16 px-5 border-b border-[#262a32] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#dc2626] shrink-0" />
              <span className="text-base font-bold tracking-tight text-[#f1f3f5]">도로 안전 관제</span>
            </div>
            <span className="text-[11px] font-mono text-[#8b929e] bg-[#1e2128] border border-[#2c313b] px-2 py-0.5 rounded">
              DSS 3.0
            </span>
          </div>

          {/* 5대 메뉴 */}
          <nav className="py-4 px-3 space-y-1">
            <div className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-[#6b7280] uppercase">
              관제 메뉴
            </div>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeMenu === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveMenu(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-3 rounded-md text-left transition-colors cursor-pointer border-l-[3px] ${
                    isActive
                      ? 'bg-[#21252c] border-l-[#3b82f6] text-white font-bold'
                      : 'border-l-transparent text-[#9ca3af] hover:bg-[#1c1f25] hover:text-[#e5e7eb] font-medium'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon
                      strokeWidth={1.75}
                      className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-[#60a5fa]' : 'text-[#717885]'}`}
                    />
                    <span className="text-[15px] truncate">{item.label}</span>
                  </div>

                  {item.id === 'MONITOR' && l3Count > 0 && (
                    <span className="px-2 py-0.5 text-xs font-mono font-bold rounded bg-[#dc2626]/20 text-[#f87171] border border-[#dc2626]/40">
                      {l3Count}
                    </span>
                  )}
                  {item.id === 'QUALITY' && camWarnCount > 0 && (
                    <span className="px-2 py-0.5 text-xs font-mono font-bold rounded bg-[#d97706]/20 text-[#fbbf24] border border-[#d97706]/40">
                      {camWarnCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* 사이드바 하단: 운영 모드 선택 & 시뮬레이션 제어 */}
        <div className="p-4 border-t border-[#262a32] space-y-3 bg-[#121418]">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#8b929e]">운영 가중치 모드</span>
              <button
                onClick={() => setActiveMenu('ANALYTICS')}
                className="text-xs text-[#60a5fa] hover:underline cursor-pointer"
              >
                규칙 설정
              </button>
            </div>
            <select
              value={weightPreset}
              onChange={(e) => {
                setWeightPreset(e.target.value);
                pushNotice(`[가중치 전환] '${e.target.options[e.target.selectedIndex].text}' 적용됨`);
              }}
              className="w-full bg-[#1a1d22] border border-[#2f343e] text-sm text-[#f1f3f5] font-medium px-3 py-2 rounded-md focus:outline-none focus:border-[#3b82f6] cursor-pointer"
            >
              <option value="NIGHT">심야/새벽 집중</option>
              <option value="RUSH">출퇴근 혼잡</option>
              <option value="RAIN">폭우/악천후</option>
              <option value="WIND">태풍/강풍 특보</option>
              <option value="NORMAL">평시 표준 (x1.0)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={simulateFallSpike}
              className="py-2 px-2.5 bg-[#23191b] hover:bg-[#2f1d20] border border-[#7f1d1d] text-[#fca5a5] text-xs font-semibold rounded-md cursor-pointer transition-colors"
            >
              쓰러짐 시연
            </button>
            <button
              onClick={resetAllAlarms}
              className="py-2 px-2.5 bg-[#1d2026] hover:bg-[#262a32] border border-[#323842] text-[#d1d5db] text-xs font-semibold rounded-md cursor-pointer transition-colors"
            >
              상태 초기화
            </button>
          </div>
        </div>
      </aside>

      {/* ==================== 우측 메인 컨텐츠 영역 ==================== */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* 상단 통합 상태 바 (실제 관제 센터 계기판 스타일) */}
        <header className="h-16 bg-[#15171b] border-b border-[#262a32] px-7 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-[#f1f3f5] tracking-tight">
              {NAV_ITEMS.find((n) => n.id === activeMenu)?.label}
            </h1>
            <span className="text-xs font-mono text-[#717885] border-l border-[#2c313b] pl-3">
              SYS TIME {systemTime}s
            </span>
            <span
              className={`px-2 py-0.5 text-[11px] font-mono font-semibold rounded border ${
                apiConnected
                  ? 'bg-[#17241d] border-[#16a34a]/50 text-[#4ade80]'
                  : 'bg-[#1c1f25] border-[#2f343e] text-[#8b929e]'
              }`}
            >
              {apiConnected ? 'LIVE API' : 'DEMO'}
            </span>
          </div>

          {/* 우측 계기판 지표 스트립 */}
          <div className="flex items-center divide-x divide-[#282c34] bg-[#111317] border border-[#282c34] rounded-md">
            <div className="px-4 py-1.5 flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-[#dc2626]" />
              <div>
                <div className="text-[11px] text-[#8b929e] leading-none">긴급 (L3)</div>
                <div className="text-base font-mono font-bold text-[#f87171] tabular-nums leading-tight mt-0.5">
                  {l3Count}건
                </div>
              </div>
            </div>

            <div className="px-4 py-1.5 flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-[#d97706]" />
              <div>
                <div className="text-[11px] text-[#8b929e] leading-none">주의 · 점검</div>
                <div className="text-base font-mono font-bold text-[#fbbf24] tabular-nums leading-tight mt-0.5">
                  {l2Count + camWarnCount}건
                </div>
              </div>
            </div>

            <div className="px-4 py-1.5">
              <div className="text-[11px] text-[#8b929e] leading-none">표출 채널</div>
              <div className="text-base font-mono font-bold text-[#f1f3f5] tabular-nums leading-tight mt-0.5">
                4 <span className="text-xs font-normal text-[#717885]">/ 9</span>
              </div>
            </div>

            <button
              onClick={() => setAutoRotateEnabled(!autoRotateEnabled)}
              className="px-4 py-1.5 flex items-center gap-2.5 hover:bg-[#1c1f25] cursor-pointer transition-colors"
            >
              {autoRotateEnabled ? (
                <Pause className="w-3.5 h-3.5 text-[#60a5fa]" />
              ) : (
                <Play className="w-3.5 h-3.5 text-[#9ca3af]" />
              )}
              <div className="text-left">
                <div className="text-[11px] text-[#8b929e] leading-none">채널 순환</div>
                <div className="text-sm font-mono font-bold text-[#e5e7eb] tabular-nums leading-tight mt-0.5">
                  {autoRotateEnabled ? `${cycleTimer}s 후 교대` : '일시정지'}
                </div>
              </div>
            </button>
          </div>
        </header>

        {/* ==================== [화면 1] 영상 관제 (MONITOR) ==================== */}
        {activeMenu === 'MONITOR' && (
          <main className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            <div className="max-w-[1720px] mx-auto grid grid-cols-12 gap-6">
              {/* 좌측 8칸: 비디오 월 */}
              <div className="col-span-12 xl:col-span-8 space-y-5">
                {/* 비디오 제어 바 */}
                <div className="bg-[#1a1d22] border border-[#282c34] px-3.5 py-2.5 rounded-lg flex items-center justify-between gap-3 whitespace-nowrap">
                  <div className="flex items-center bg-[#121418] p-1 rounded-md border border-[#262a32] shrink-0">
                    <button
                      onClick={() => setMonitorViewMode('FOCUS_4')}
                      className={`px-3.5 py-1.5 rounded text-sm font-semibold flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors ${
                        monitorViewMode === 'FOCUS_4'
                          ? 'bg-[#2563eb] text-white'
                          : 'text-[#9ca3af] hover:text-white'
                      }`}
                    >
                      <Monitor className="w-4 h-4 shrink-0" />
                      핵심 4채널 (2×2)
                    </button>
                    <button
                      onClick={() => setMonitorViewMode('ALL_9')}
                      className={`px-3.5 py-1.5 rounded text-sm font-semibold flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors ${
                        monitorViewMode === 'ALL_9'
                          ? 'bg-[#2563eb] text-white'
                          : 'text-[#9ca3af] hover:text-white'
                      }`}
                    >
                      <LayoutGrid className="w-4 h-4 shrink-0" />
                      전체 9채널 (3×3)
                    </button>
                  </div>

                  {/* 고정 너비 오버레이 스위치 */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setShowBboxes(!showBboxes)}
                      className={`w-[116px] py-1.5 rounded-md text-xs sm:text-sm font-semibold border flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                        showBboxes
                          ? 'bg-[#1e2636] border-[#3b82f6]/60 text-[#93c5fd]'
                          : 'bg-[#15171b] border-[#2c313b] text-[#717885]'
                      }`}
                    >
                      <span>객체 박스</span>
                      <span className="font-mono font-bold w-6 text-center">{showBboxes ? 'ON' : 'OFF'}</span>
                    </button>
                    <button
                      onClick={() => setShowRoiZones(!showRoiZones)}
                      className={`w-[112px] py-1.5 rounded-md text-xs sm:text-sm font-semibold border flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                        showRoiZones
                          ? 'bg-[#262116] border-[#d97706]/60 text-[#fcd34d]'
                          : 'bg-[#15171b] border-[#2c313b] text-[#717885]'
                      }`}
                    >
                      <span>ROI 구역</span>
                      <span className="font-mono font-bold w-6 text-center">{showRoiZones ? 'ON' : 'OFF'}</span>
                    </button>
                    <button
                      onClick={() => setGlobalAiEnhance(!globalAiEnhance)}
                      className={`w-[126px] py-1.5 rounded-md text-xs sm:text-sm font-semibold border flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                        globalAiEnhance
                          ? 'bg-[#1e2636] border-[#3b82f6]/60 text-[#93c5fd]'
                          : 'bg-[#15171b] border-[#2c313b] text-[#717885]'
                      }`}
                    >
                      <span>화질 보정</span>
                      <span className="font-mono font-bold w-6 text-center">{globalAiEnhance ? 'ON' : 'OFF'}</span>
                    </button>
                  </div>
                </div>

                {/* 메인 비디오 그리드 */}
                <div
                  className={`grid ${
                    monitorViewMode === 'FOCUS_4'
                      ? 'grid-cols-1 md:grid-cols-2 gap-4'
                      : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5'
                  }`}
                >
                  {(monitorViewMode === 'FOCUS_4' ? monitoredCameras : sortedCameras).map((cam, idx) => {
                    const isMonitored = idx < 4;
                    const isSelected = cam.id === selectedCam.id;
                    const isCompactGrid = monitorViewMode === 'ALL_9';

                    let borderClass = 'border-[#282c34] hover:border-[#3c434f]';
                    if (isMonitored && cam.level === 'L3') {
                      borderClass = 'border-[#dc2626]';
                    } else if (isMonitored && (cam.level === 'L2' || cam.level === 'CAM_WARN')) {
                      borderClass = 'border-[#d97706]';
                    } else if (isMonitored) {
                      borderClass = 'border-[#4b5563]';
                    }

                    return (
                      <div
                        key={cam.id}
                        onClick={() => setSelectedCamId(cam.id)}
                        className={`bg-[#1a1d22] border-[1.5px] rounded-lg overflow-hidden cursor-pointer transition-colors flex flex-col ${borderClass} ${
                          isSelected ? 'ring-2 ring-[#3b82f6] ring-offset-1 ring-offset-[#0f1114]' : ''
                        }`}
                      >
                        {/* 16:9 비디오 프레임 */}
                        <div className="relative aspect-video bg-black overflow-hidden group">
                          <video
                            src={cam.videoUrl}
                            poster={cam.posterUrl}
                            autoPlay
                            loop
                            muted
                            playsInline
                            style={{
                              filter: globalAiEnhance ? cam.enhancedFilter : cam.rawFilter
                            }}
                            className={`w-full h-full object-cover transition-opacity duration-200 ${
                              isMonitored ? 'opacity-100' : 'opacity-65 group-hover:opacity-95'
                            }`}
                          />

                          {/* ROI 구역 다각형 */}
                          {showRoiZones && cam.roiZones && cam.roiZones.length > 0 && (
                            <svg
                              viewBox="0 0 100 100"
                              preserveAspectRatio="none"
                              className="absolute inset-0 w-full h-full pointer-events-none opacity-65"
                            >
                              {cam.roiZones.map((z, zi) => (
                                <polygon
                                  key={zi}
                                  points={z.points}
                                  fill={`${z.color}24`}
                                  stroke={z.color}
                                  strokeWidth="0.9"
                                  strokeDasharray="2 1"
                                />
                              ))}
                            </svg>
                          )}

                          {/* 객체 바운딩 박스 */}
                          {showBboxes &&
                            cam.boxes.map((b) => (
                              <div
                                key={b.id}
                                style={{
                                  left: `${b.x}%`,
                                  top: `${b.y}%`,
                                  width: `${b.w}%`,
                                  height: `${b.h}%`,
                                  borderColor: b.color
                                }}
                                className="absolute border-[1.5px] pointer-events-none"
                              >
                                <span
                                  style={{ backgroundColor: b.color }}
                                  className={`absolute left-0 ${
                                    b.y < 18 ? 'top-0' : '-top-4'
                                  } text-[10px] font-mono font-bold text-white px-1.5 py-0.5 whitespace-nowrap leading-none`}
                                >
                                  {b.id} {b.cls} {b.tag && `· ${b.tag}`}
                                </span>
                              </div>
                            ))}

                          {/* 화각이탈 경고 오버레이 */}
                          {cam.level === 'CAM_WARN' && (
                            <div className="absolute inset-0 bg-[#0f1114]/80 flex flex-col items-center justify-center p-4 text-center">
                              <div className="px-2.5 py-1 bg-[#d97706]/20 border border-[#d97706] text-[#fbbf24] text-xs font-bold rounded mb-1.5">
                                CAMERA FAULT · 탐지율 {cam.reliability}%
                              </div>
                              <div className="text-xs sm:text-sm font-semibold text-[#f1f3f5]">
                                강풍 화각 이탈 (+14.5°) · 수동 모니터링 전환
                              </div>
                            </div>
                          )}

                          {/* 좌상단 OSD 배지 */}
                          <div className="absolute top-2 left-2 flex items-center gap-1.5 max-w-[75%] pointer-events-none">
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-bold whitespace-nowrap shrink-0 ${
                                isMonitored
                                  ? cam.level === 'L3'
                                    ? 'bg-[#dc2626] text-white'
                                    : cam.level === 'L2'
                                    ? 'bg-[#d97706] text-black'
                                    : 'bg-[#2563eb] text-white'
                                  : 'bg-[#15171b]/90 text-[#9ca3af] border border-[#343a44]'
                              }`}
                            >
                              {isMonitored ? `K${idx + 1}` : '대기'}
                            </span>
                            <span className="px-2 py-0.5 bg-black/75 text-[#f1f3f5] text-[11px] font-mono font-semibold rounded border border-white/10 truncate">
                              {cam.shortId}
                            </span>
                          </div>

                          {/* 우상단 고정/확대 버튼 */}
                          <div className="absolute top-2 right-2 flex items-center gap-1">
                            <button
                              onClick={(e) => togglePinCamera(cam.id, e)}
                              title={cam.pinned ? '고정 해제' : '화면 고정'}
                              className={`p-1.5 rounded border cursor-pointer transition-opacity ${
                                cam.pinned
                                  ? 'bg-[#dc2626] text-white border-[#f87171] opacity-100'
                                  : 'bg-black/75 text-[#d1d5db] border-white/15 opacity-0 group-hover:opacity-100 hover:text-white'
                              }`}
                            >
                              {cam.pinned ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setInspectModalCamId(cam.id);
                              }}
                              title="원본/보정 비교 확대"
                              className="p-1.5 rounded bg-black/75 hover:bg-black text-[#e5e7eb] border border-white/15 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                            >
                              <Maximize2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* 10초 순환 프로그레스 바 */}
                          {isMonitored && (
                            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-black/70">
                              <div
                                style={{ width: `${((10 - cycleTimer) / 10) * 100}%` }}
                                className={`h-full transition-all duration-1000 ${
                                  cam.level === 'L3'
                                    ? 'bg-[#dc2626]'
                                    : cam.level === 'L2'
                                    ? 'bg-[#d97706]'
                                    : 'bg-[#3b82f6]'
                                }`}
                              />
                            </div>
                          )}
                        </div>

                        {/* 하단 정보 바: 2줄 고정 높이 규격 */}
                        <div
                          className={`bg-[#1a1d22] flex flex-col justify-between border-t border-[#262a32] ${
                            isCompactGrid ? 'px-3 py-2 h-[58px]' : 'px-3.5 py-2.5 h-[66px]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              <span
                                className={`${
                                  isCompactGrid ? 'text-xs' : 'text-sm'
                                } font-bold whitespace-nowrap shrink-0 ${
                                  cam.level === 'L3'
                                    ? 'text-[#f87171]'
                                    : cam.level === 'L2' || cam.level === 'CAM_WARN'
                                    ? 'text-[#fbbf24]'
                                    : 'text-[#e5e7eb]'
                                }`}
                              >
                                {cam.eventType}
                              </span>
                              <span className="text-xs text-[#8b929e] truncate">
                                {cam.zone} · {cam.subLabel}
                              </span>
                            </div>

                            <span
                              className={`${
                                isCompactGrid ? 'text-xs' : 'text-sm'
                              } font-mono font-bold tabular-nums whitespace-nowrap shrink-0 ${
                                cam.level === 'L3'
                                  ? 'text-[#f87171]'
                                  : cam.level === 'L2'
                                  ? 'text-[#fbbf24]'
                                  : 'text-[#9ca3af]'
                              }`}
                            >
                              {cam.finalRisk}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2 min-w-0">
                            <div className="text-[11px] text-[#8b929e] truncate min-w-0 flex-1 font-mono">
                              <span className="text-[#93c5fd] font-sans font-medium">{cam.aiStatus}</span>
                              <span> · {cam.reliability}% · {cam.elapsed}s</span>
                            </div>

                            {!cam.acknowledged && (cam.level === 'L3' || cam.level === 'L2') ? (
                              <button
                                onClick={(e) => handleAcknowledge(cam.id, e)}
                                className="px-2 py-0.5 bg-[#1e2923] hover:bg-[#16a34a] text-[#4ade80] hover:text-white border border-[#16a34a]/50 text-[11px] font-semibold rounded whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                              >
                                확인
                              </button>
                            ) : (
                              <span className="text-[11px] text-[#6b7280] whitespace-nowrap shrink-0">
                                {cam.level === 'CAM_WARN' ? '점검필요' : '정상'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 2x2 모드 하단 대기 채널 5대 요약 */}
                {monitorViewMode === 'FOCUS_4' && (
                  <div className="bg-[#1a1d22] border border-[#282c34] rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold text-[#9ca3af] uppercase tracking-wide">
                        순환 대기 채널 (5대)
                      </span>
                      <button
                        onClick={() => setMonitorViewMode('ALL_9')}
                        className="text-xs font-semibold text-[#60a5fa] hover:underline cursor-pointer"
                      >
                        전체 9채널 보기
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                      {standbyCameras.map((cam) => {
                        const isSelected = cam.id === selectedCam.id;
                        return (
                          <div
                            key={cam.id}
                            onClick={() => setSelectedCamId(cam.id)}
                            className={`p-3 rounded-md border cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-[#1e2636] border-[#3b82f6]'
                                : 'bg-[#131519] border-[#262a32] hover:border-[#3c434f]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs font-mono font-bold text-[#f1f3f5]">{cam.shortId}</span>
                              <span
                                className={`text-[11px] font-semibold ${
                                  cam.level === 'L2'
                                    ? 'text-[#fbbf24]'
                                    : cam.level === 'CAM_WARN'
                                    ? 'text-[#f87171]'
                                    : 'text-[#8b929e]'
                                }`}
                              >
                                {cam.eventType}
                              </span>
                            </div>
                            <div className="text-xs text-[#8b929e] mt-1 truncate">{cam.subLabel}</div>
                            <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-[#22262e] text-[11px] font-mono text-[#9ca3af]">
                              <span>위험도 {cam.finalRisk}</span>
                              <span>{cam.reliability}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* 우측 4칸: 선택 카메라 상세 대응 패널 & 알람 큐 */}
              <div className="col-span-12 xl:col-span-4 space-y-5">
                {/* 1) 선택 카메라 상세 및 현장 조치 */}
                <div className="bg-[#1a1d22] border border-[#282c34] rounded-lg p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3 border-b border-[#262a32] pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 text-xs font-bold rounded ${
                            selectedCam.level === 'L3'
                              ? 'bg-[#dc2626] text-white'
                              : selectedCam.level === 'L2' || selectedCam.level === 'CAM_WARN'
                              ? 'bg-[#d97706] text-black'
                              : 'bg-[#2c313b] text-[#d1d5db]'
                          }`}
                        >
                          {selectedCam.level === 'CAM_WARN' ? '장비 경고' : selectedCam.level}
                        </span>
                        <h2 className="text-lg font-mono font-bold text-[#f1f3f5]">{selectedCam.id}</h2>
                      </div>
                      <p className="text-sm text-[#a1a7b3] mt-1">{selectedCam.roadTypeKo}</p>
                    </div>

                    <div className="text-right bg-[#131519] px-3.5 py-2 rounded-md border border-[#282c34]">
                      <div className="text-[11px] text-[#8b929e]">위험도</div>
                      <div
                        className={`text-xl font-mono font-bold tabular-nums leading-tight ${
                          selectedCam.level === 'L3'
                            ? 'text-[#f87171]'
                            : selectedCam.level === 'L2'
                            ? 'text-[#fbbf24]'
                            : 'text-[#e5e7eb]'
                        }`}
                      >
                        {selectedCam.finalRisk}
                      </div>
                    </div>
                  </div>

                  {/* 상세 명세 테이블 스타일 */}
                  <div className="bg-[#131519] border border-[#262a32] rounded-md divide-y divide-[#22262e] text-sm">
                    <div className="p-3.5">
                      <div className="text-xs text-[#8b929e]">탐지 상황</div>
                      <div className="font-semibold text-[#f1f3f5] mt-1 leading-snug">
                        {selectedCam.detailEvent}
                      </div>
                    </div>

                    <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                      <span className="text-xs text-[#8b929e]">화질 보정 상태</span>
                      <span className="text-xs font-semibold text-[#93c5fd]">
                        {selectedCam.aiStatus} (신뢰도 {selectedCam.reliability}%)
                      </span>
                    </div>

                    <div className="p-3.5 space-y-2">
                      <div className="text-xs text-[#8b929e]">적용 가중치</div>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedCam.weightFactors.map((wf, idx) => (
                          <span
                            key={idx}
                            className="px-2.5 py-1 bg-[#1c1f25] border border-[#2e333d] text-xs text-[#d1d5db] rounded"
                          >
                            {wf.label} <strong className="font-mono text-[#fbbf24] ml-1">{wf.mult}</strong>
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="p-3.5 bg-[#161a21]">
                      <div className="text-xs font-semibold text-[#60a5fa]">표준 대응 권고 (SOP)</div>
                      <div className="text-sm text-[#e5e7eb] mt-1 leading-relaxed">
                        {selectedCam.sopRecommended}
                      </div>
                    </div>
                  </div>

                  {/* 현장 대응 버튼 그룹 */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      onClick={() => handleSopAction('119 구급대 및 경찰서 긴급 출동 요청')}
                      className="col-span-2 py-3 px-4 bg-[#b91c1c] hover:bg-[#dc2626] text-white text-sm font-bold rounded-md cursor-pointer transition-colors"
                    >
                      119 · 경찰 즉시 출동 요청
                    </button>

                    <button
                      onClick={() => handleSopAction(`${selectedCam.vmsId} 실시간 송출`)}
                      className="py-2.5 px-3 bg-[#22262e] hover:bg-[#2c313b] border border-[#343a44] text-[#e5e7eb] text-sm font-semibold rounded-md cursor-pointer transition-colors"
                    >
                      VMS 전광판 송출
                    </button>

                    <button
                      onClick={() => handleSopAction('유지보수 부서 현장 점검/수거 지시')}
                      className="py-2.5 px-3 bg-[#22262e] hover:bg-[#2c313b] border border-[#343a44] text-[#e5e7eb] text-sm font-semibold rounded-md cursor-pointer transition-colors"
                    >
                      유지보수 호출
                    </button>

                    <button
                      onClick={() => handleManualEnhanceRequest(selectedCam)}
                      disabled={enhancingCamId === selectedCam.id}
                      className="col-span-2 py-2.5 px-4 bg-[#1d4ed8] hover:bg-[#2563eb] disabled:opacity-60 text-white text-sm font-semibold rounded-md cursor-pointer transition-colors"
                    >
                      {enhancingCamId === selectedCam.id
                        ? '화질 보정 요청 처리중...'
                        : '수동 화질 개선 요청'}
                    </button>

                    <button
                      onClick={() => setInspectModalCamId(selectedCam.id)}
                      className="py-2.5 px-3 bg-[#1a1d22] hover:bg-[#242830] border border-[#343a44] text-[#d1d5db] text-sm font-semibold rounded-md cursor-pointer transition-colors"
                    >
                      화질 전/후 비교
                    </button>

                    <button
                      onClick={() => handleAcknowledge(selectedCam.id)}
                      className="py-2.5 px-3 bg-[#17241d] hover:bg-[#1e3127] border border-[#16a34a]/50 text-[#4ade80] text-sm font-semibold rounded-md cursor-pointer transition-colors"
                    >
                      알람 확인 처리
                    </button>
                  </div>
                </div>

                {/* 2) 미확인 활성 알람 대기열 */}
                <div className="bg-[#1a1d22] border border-[#282c34] rounded-lg p-5 space-y-3">
                  <div className="flex items-center justify-between border-b border-[#262a32] pb-3">
                    <h3 className="text-base font-bold text-[#f1f3f5]">미확인 알람 대기열</h3>
                    <span className="text-xs font-mono text-[#8b929e]">총 {l3Count + l2Count}건</span>
                  </div>

                  <div className="space-y-2 max-h-[320px] overflow-y-auto custom-scrollbar pr-1">
                    {sortedCameras
                      .filter((c) => !c.acknowledged && (c.level === 'L3' || c.level === 'L2'))
                      .map((cam) => {
                        const isSelected = cam.id === selectedCam.id;
                        return (
                          <div
                            key={cam.id}
                            onClick={() => setSelectedCamId(cam.id)}
                            className={`p-3 rounded-md border flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-[#22262e] border-[#3b82f6]'
                                : 'bg-[#131519] border-[#262a32] hover:bg-[#1c1f25]'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`px-1.5 py-0.5 text-[11px] font-mono font-bold rounded ${
                                    cam.level === 'L3'
                                      ? 'bg-[#dc2626]/20 text-[#f87171]'
                                      : 'bg-[#d97706]/20 text-[#fbbf24]'
                                  }`}
                                >
                                  {cam.level}
                                </span>
                                <span className="text-sm font-bold text-[#f1f3f5]">{cam.eventType}</span>
                                <span className="text-xs font-mono text-[#8b929e]">{cam.shortId}</span>
                              </div>
                              <div className="text-xs text-[#8b929e] mt-1 truncate">{cam.subLabel}</div>
                            </div>

                            <div className="flex items-center gap-2.5 shrink-0">
                              <div className="text-right font-mono">
                                <div className="text-sm font-bold text-[#f87171]">{cam.finalRisk}</div>
                                <div className="text-[11px] text-[#717885]">{cam.elapsed}s</div>
                              </div>
                              <button
                                onClick={(e) => handleAcknowledge(cam.id, e)}
                                className="px-2.5 py-1.5 bg-[#1e2128] hover:bg-[#16a34a] text-[#d1d5db] hover:text-white text-xs font-semibold rounded border border-[#323842] cursor-pointer transition-colors"
                              >
                                확인
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            </div>
          </main>
        )}

        {/* ==================== [화면 2] GIS 공간 지도 (GIS) ==================== */}
        {activeMenu === 'GIS' && (
          <main className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            <div className="max-w-[1720px] mx-auto grid grid-cols-12 gap-6">
              {/* 좌측 8칸: 실제 Leaflet GIS 지도 */}
              <div className="col-span-12 xl:col-span-8 bg-[#1a1d22] border border-[#282c34] rounded-lg overflow-hidden flex flex-col">
                <div className="px-5 py-3.5 border-b border-[#262a32] flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-base font-bold text-[#f1f3f5]">관할 구역 실시간 공간 지도 (GIS)</h2>

                  <div className="flex items-center gap-2">
                    {[
                      { key: 'heatmap', label: '위험 반경' },
                      { key: 'fov', label: '카메라 화각' },
                      { key: 'floodZone', label: '관리 구역' }
                    ].map((ly) => (
                      <button
                        key={ly.key}
                        onClick={() => setMapLayers({ ...mapLayers, [ly.key]: !mapLayers[ly.key] })}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold border cursor-pointer transition-colors ${
                          mapLayers[ly.key]
                            ? 'bg-[#1e2636] border-[#3b82f6]/60 text-[#93c5fd]'
                            : 'bg-[#131519] border-[#2c313b] text-[#717885]'
                        }`}
                      >
                        {ly.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="relative flex-1 min-h-[600px] bg-[#111317]">
                  <TechnicalGisMap
                    cameras={sortedCameras}
                    selectedCam={selectedCam}
                    onSelectCam={(id) => setSelectedCamId(id)}
                    layers={mapLayers}
                  />
                </div>

                {/* 하단 빠른 지점 이동 바 */}
                <div className="px-4 py-3 bg-[#15171b] border-t border-[#262a32] flex items-center gap-2 overflow-x-auto custom-scrollbar">
                  <span className="text-xs font-semibold text-[#8b929e] shrink-0 mr-1">지점 이동</span>
                  {sortedCameras.map((cam, idx) => {
                    const isSelected = cam.id === selectedCam.id;
                    return (
                      <button
                        key={cam.id}
                        onClick={() => setSelectedCamId(cam.id)}
                        className={`px-2.5 py-1.5 rounded text-xs font-semibold border whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-[#2563eb] text-white border-[#3b82f6]'
                            : 'bg-[#1a1d22] text-[#d1d5db] border-[#2c313b] hover:border-[#4b5563]'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            cam.level === 'L3'
                              ? 'bg-[#dc2626]'
                              : cam.level === 'L2' || cam.level === 'CAM_WARN'
                              ? 'bg-[#d97706]'
                              : 'bg-[#6b7280]'
                          }`}
                        />
                        <span className="font-mono">{idx < 4 ? `[K${idx + 1}] ` : ''}{cam.shortId}</span>
                        <span className={isSelected ? 'text-blue-100' : 'text-[#8b929e]'}>{cam.zone}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 우측 4칸: 선택 지점 상세 */}
              <div className="col-span-12 xl:col-span-4 space-y-5">
                <div className="bg-[#1a1d22] border border-[#282c34] rounded-lg overflow-hidden">
                  <div className="relative aspect-video bg-black">
                    <video
                      src={selectedCam.videoUrl}
                      poster={selectedCam.posterUrl}
                      autoPlay
                      loop
                      muted
                      playsInline
                      style={{ filter: globalAiEnhance ? selectedCam.enhancedFilter : selectedCam.rawFilter }}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2.5 left-2.5 px-2.5 py-1 bg-black/80 text-white text-xs font-mono font-semibold rounded border border-white/15">
                      {selectedCam.id} · {selectedCam.zone}
                    </div>
                  </div>

                  <div className="p-5 space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-lg font-bold text-[#f1f3f5]">{selectedCam.roadTypeKo}</h3>
                        <p className="text-xs text-[#8b929e] font-mono mt-1">
                          {selectedCam.lat}N, {selectedCam.lng}E · FOV {selectedCam.fovAngle}°
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] text-[#8b929e]">위험도</div>
                        <div className="text-xl font-mono font-bold text-[#f87171]">{selectedCam.finalRisk}</div>
                      </div>
                    </div>

                    <div className="bg-[#131519] border border-[#262a32] rounded-md p-3.5 space-y-2">
                      <div className="text-xs text-[#8b929e]">탐지 이벤트</div>
                      <div className="text-sm font-semibold text-[#f1f3f5]">{selectedCam.detailEvent}</div>
                      <div className="text-xs text-[#93c5fd] pt-1">연동 전광판: {selectedCam.vmsId}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        onClick={() => handleSopAction('119·경찰 긴급 출동 요청')}
                        className="py-2.5 bg-[#b91c1c] hover:bg-[#dc2626] text-white text-sm font-bold rounded-md cursor-pointer"
                      >
                        119 · 경찰 호출
                      </button>
                      <button
                        onClick={() => handleSopAction(`${selectedCam.vmsId} 송출`)}
                        className="py-2.5 bg-[#22262e] hover:bg-[#2c313b] border border-[#343a44] text-white text-sm font-semibold rounded-md cursor-pointer"
                      >
                        VMS 송출
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </main>
        )}

        {/* ==================== [화면 3] 화질 보정 · 장비 진단 (QUALITY) ==================== */}
        {activeMenu === 'QUALITY' && (
          <main className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            <div className="max-w-[1720px] mx-auto grid grid-cols-12 gap-6">
              {/* 좌측 7칸: Before/After 화질 비교 스튜디오 */}
              <div className="col-span-12 xl:col-span-7 bg-[#1a1d22] border border-[#282c34] rounded-lg p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#262a32] pb-3.5">
                  <div>
                    <h2 className="text-lg font-bold text-[#f1f3f5]">
                      {selectedCam.id} ({selectedCam.subLabel}) — 원본 / 보정 비교
                    </h2>
                  </div>
                  <div className="text-xs font-medium text-[#93c5fd] bg-[#131519] border border-[#282c34] px-3 py-1.5 rounded">
                    {selectedCam.aiTechnique}
                  </div>
                </div>

                {/* Before / After 분할 비교 */}
                <div className="relative aspect-video bg-black border border-[#323842] rounded-md overflow-hidden select-none">
                  <video
                    src={selectedCam.videoUrl}
                    poster={selectedCam.posterUrl}
                    autoPlay
                    loop
                    muted
                    playsInline
                    style={{ filter: selectedCam.enhancedFilter }}
                    className="absolute inset-0 w-full h-full object-cover"
                  />

                  <div
                    style={{ clipPath: `inset(0 ${100 - splitSliderPos}% 0 0)` }}
                    className="absolute inset-0"
                  >
                    <video
                      src={selectedCam.videoUrl}
                      poster={selectedCam.posterUrl}
                      autoPlay
                      loop
                      muted
                      playsInline
                      style={{ filter: selectedCam.rawFilter }}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div
                    style={{ left: `${splitSliderPos}%` }}
                    className="absolute top-0 bottom-0 w-0.5 bg-[#3b82f6] pointer-events-none"
                  >
                    <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 px-2.5 py-1 bg-[#2563eb] text-white text-xs font-bold rounded shadow whitespace-nowrap">
                      원본 | 보정
                    </div>
                  </div>

                  <div className="absolute top-3 left-3 bg-black/80 px-3 py-1 text-xs font-semibold text-[#d1d5db] rounded border border-white/10">
                    원본 보존 · {selectedCam.weatherCond}
                  </div>
                  <div className="absolute top-3 right-3 bg-black/80 px-3 py-1 text-xs font-semibold text-[#93c5fd] rounded border border-[#3b82f6]/40">
                    보정 적용 · {selectedCam.aiStatus} ({selectedCam.reliability}%)
                  </div>
                </div>

                {/* 슬라이더 */}
                <div className="bg-[#131519] border border-[#262a32] px-4 py-3 rounded-md flex items-center gap-4">
                  <span className="text-sm font-semibold text-[#d1d5db] shrink-0">비교 경계선</span>
                  <input
                    type="range"
                    min="5"
                    max="95"
                    value={splitSliderPos}
                    onChange={(e) => setSplitSliderPos(Number(e.target.value))}
                    className="flex-1 accent-[#2563eb] cursor-pointer"
                  />
                  <span className="text-sm font-mono font-bold text-[#93c5fd] w-10 text-right">
                    {splitSliderPos}%
                  </span>
                </div>

                {/* 수동 화질 개선 요청 패널 */}
                <div className="bg-[#131519] border border-[#262a32] p-4 rounded-md space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-bold text-[#f1f3f5]">수동 화질 보정 기법 선택</span>
                    <button
                      onClick={() => handleManualEnhanceRequest(selectedCam, selectedEnhanceMode)}
                      disabled={enhancingCamId === selectedCam.id}
                      className="px-4 py-2 bg-[#1d4ed8] hover:bg-[#2563eb] disabled:opacity-60 text-white text-sm font-bold rounded-md cursor-pointer transition-colors"
                    >
                      {enhancingCamId === selectedCam.id
                        ? '화질 보정 요청 처리중...'
                        : `${selectedCam.shortId} 수동 화질 개선 요청`}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {MANUAL_ENHANCE_MODES.map((item) => {
                      const isPicked = selectedEnhanceMode === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => setSelectedEnhanceMode(item.id)}
                          className={`p-3 rounded-md border text-left cursor-pointer transition-colors ${
                            isPicked
                              ? 'bg-[#1e2636] border-[#3b82f6] text-white'
                              : 'bg-[#1a1d22] border-[#282c34] text-[#d1d5db] hover:border-[#3c434f]'
                          }`}
                        >
                          <div className="text-sm font-bold text-[#f1f3f5]">{item.title}</div>
                          <div className="text-xs text-[#8b929e] mt-1">{item.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 우측 5칸: 카메라 화질·센서 진단 목록 */}
              <div className="col-span-12 xl:col-span-5 bg-[#1a1d22] border border-[#282c34] rounded-lg p-5 space-y-3.5">
                <h3 className="text-base font-bold text-[#f1f3f5] border-b border-[#262a32] pb-3">
                  전체 카메라 화질 · 화각 진단
                </h3>

                <div className="space-y-2.5 max-h-[620px] overflow-y-auto custom-scrollbar pr-1">
                  {sortedCameras.map((c) => {
                    const isSelected = c.id === selectedCam.id;
                    const isWarn = c.level === 'CAM_WARN';
                    return (
                      <div
                        key={c.id}
                        onClick={() => setSelectedCamId(c.id)}
                        className={`p-3.5 rounded-md border cursor-pointer transition-colors ${
                          isWarn
                            ? 'bg-[#251f16] border-[#d97706]'
                            : isSelected
                            ? 'bg-[#1e2636] border-[#3b82f6]'
                            : 'bg-[#131519] border-[#262a32] hover:border-[#3c434f]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-mono font-bold text-[#f1f3f5]">{c.id}</span>
                            <span className="text-xs text-[#9ca3af] truncate">{c.roadTypeKo}</span>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-mono font-bold shrink-0 ${
                              c.reliability < 30
                                ? 'bg-[#dc2626] text-white'
                                : 'bg-[#17241d] text-[#4ade80] border border-[#16a34a]/40'
                            }`}
                          >
                            {c.reliability}%
                          </span>
                        </div>

                        <div className="mt-2 flex items-center justify-between text-xs">
                          <span className="text-[#8b929e]">{c.weatherCond}</span>
                          <span className="text-[#93c5fd] font-medium">{c.aiStatus}</span>
                        </div>

                        {isWarn && (
                          <div className="mt-2.5 pt-2.5 border-t border-[#d97706]/30 flex items-center justify-between">
                            <span className="text-xs font-semibold text-[#fbbf24]">
                              탐지율 30% 미만 · 자동 탐지 중지
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSopAction('강풍 화각이탈 긴급 유지보수팀 파견', c);
                              }}
                              className="px-3 py-1 bg-[#d97706] hover:bg-[#f59e0b] text-black text-xs font-bold rounded cursor-pointer"
                            >
                              유지보수 호출
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </main>
        )}

        {/* ==================== [화면 4] 동적 가중치 · 시계열 분석 (ANALYTICS) ==================== */}
        {activeMenu === 'ANALYTICS' && (
          <main className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            <div className="max-w-[1720px] mx-auto space-y-6">
              {/* 상단: 5가지 동적 가중치 프로파일 */}
              <div className="bg-[#1a1d22] border border-[#282c34] rounded-lg p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-bold text-[#f1f3f5]">상황별 동적 가중치 조절 (DSS)</h2>
                  <span className="px-3 py-1 bg-[#1e2636] border border-[#3b82f6]/50 text-[#93c5fd] text-xs font-semibold rounded">
                    활성 프로파일: {WEIGHT_PRESETS.find((p) => p.id === weightPreset)?.label}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-3">
                  {WEIGHT_PRESETS.map((preset) => {
                    const active = weightPreset === preset.id;
                    return (
                      <button
                        key={preset.id}
                        onClick={() => {
                          setWeightPreset(preset.id);
                          pushNotice(`[동적 가중치 전환] '${preset.label}' 프로파일 적용됨`);
                        }}
                        className={`p-4 rounded-md border text-left cursor-pointer transition-colors ${
                          active
                            ? 'bg-[#1e2636] border-[#3b82f6]'
                            : 'bg-[#131519] border-[#262a32] hover:border-[#3c434f]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-mono text-[#717885]">{preset.code}</span>
                          {active && (
                            <span className="px-2 py-0.5 bg-[#2563eb] text-white text-[11px] font-semibold rounded">
                              적용중
                            </span>
                          )}
                        </div>
                        <div className="text-base font-bold text-[#f1f3f5] mt-2">{preset.label}</div>
                        <p className="text-xs text-[#9ca3af] mt-1 leading-relaxed">{preset.shortDesc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 하단: 시계열 스파이크 차트 + 4대 산출 기준 */}
              <div className="grid grid-cols-12 gap-6">
                <div className="col-span-12 xl:col-span-7 bg-[#1a1d22] border border-[#282c34] rounded-lg p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-[#f1f3f5]">시간대별 위험도 스파이크 추이</h3>
                    <span className="px-3 py-1 bg-[#131519] border border-[#2c313b] text-[#e5e7eb] text-xs font-mono font-semibold rounded">
                      분석 시점 {chartCursor}s / 150s
                    </span>
                  </div>

                  <ModernDarkTimeSeriesChart
                    data={chartPoints}
                    cursor={chartCursor}
                    onSelectSec={(s) => setChartCursor(s)}
                  />
                </div>

                <div className="col-span-12 xl:col-span-5 bg-[#1a1d22] border border-[#282c34] rounded-lg p-5 space-y-3">
                  <h3 className="text-base font-bold text-[#f1f3f5]">4대 동적 가중치 산출 기준</h3>
                  <div className="space-y-2.5">
                    {[
                      {
                        tag: '시간대 · 통행량',
                        title: '심야/새벽 vs 출퇴근 혼잡',
                        desc: '심야에는 소형 적치물과 쓰러짐 가중치를 최대로 높이고, 출퇴근 혼잡 시에는 차로를 막는 대형 장애물에 집중합니다.'
                      },
                      {
                        tag: '기상 · 영상품질',
                        title: '악천후 보정 및 강풍 화각 이탈',
                        desc: '보정 후에도 탐지율이 30% 미만이면 수동 모니터링 전환을 안내하며, 강풍 화각 이탈 시 오탐 방지를 위해 자동 탐지를 중지합니다.'
                      },
                      {
                        tag: '장소 · 도로특성',
                        title: '보호구역 vs 산단 진입로 · 고속화도로',
                        desc: '어린이·노인 보호구역은 시야 가림 적치물 민감도를 높이고, 산단 진입로 화물 낙하물은 VMS 전광판과 연동합니다.'
                      },
                      {
                        tag: '위험 유형 긴급도',
                        title: '보행자 쓰러짐 vs 일반 쓰레기봉투',
                        desc: '누워 있는 보행자는 최고 위험 등급(119 호출)으로 배정하고, 보도 가장자리 일반 쓰레기봉투는 목록에만 기록합니다.'
                      }
                    ].map((rule, i) => (
                      <div key={i} className="bg-[#131519] border border-[#262a32] p-3.5 rounded-md">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-[#1e2636] text-[#93c5fd] text-[11px] font-semibold rounded">
                            {rule.tag}
                          </span>
                          <span className="text-sm font-bold text-[#f1f3f5]">{rule.title}</span>
                        </div>
                        <p className="text-xs text-[#9ca3af] mt-1.5 leading-relaxed">{rule.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </main>
        )}

        {/* ==================== [화면 5] 이벤트 로그 · 백엔드 실측 (BACKEND) ==================== */}
        {activeMenu === 'BACKEND' && (
          <main className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            <div className="max-w-[1720px] mx-auto grid grid-cols-12 gap-6">
              {/* 좌측 5칸: RF-DETR 실측 출력 영상 & 관제 조치 이력 */}
              <div className="col-span-12 xl:col-span-5 space-y-5">
                <div className="bg-[#1a1d22] border border-[#282c34] rounded-lg p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold text-[#f1f3f5]">RF-DETR + ByteTrack 실측 영상</h2>
                    <span className="px-2 py-0.5 bg-[#17241d] text-[#4ade80] border border-[#16a34a]/40 text-xs font-mono font-semibold rounded">
                      BACKEND LINKED
                    </span>
                  </div>

                  <div className="relative aspect-[4/3] bg-black rounded-md overflow-hidden border border-[#2c313b]">
                    <video
                      src="/videos/vtest_zones_h264.mp4"
                      autoPlay
                      loop
                      muted
                      playsInline
                      controls
                      className="w-full h-full object-contain"
                    />
                  </div>

                  {backendData && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-[#131519] border border-[#262a32] p-3.5 rounded-md">
                        <div className="text-xs text-[#8b929e]">총 처리 프레임 / 객체</div>
                        <div className="text-base font-mono font-bold text-[#93c5fd] mt-1">
                          {backendData.run.summary.detections.frames_seen}f · {backendData.run.records.detections}건
                        </div>
                      </div>
                      <div className="bg-[#131519] border border-[#262a32] p-3.5 rounded-md">
                        <div className="text-xs text-[#8b929e]">추적 이벤트 총계</div>
                        <div className="text-base font-mono font-bold text-[#fbbf24] mt-1">
                          {backendData.total_events}건 (위험 {backendData.run.summary.tracking.events_by_type.hazard_start}건)
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 관제 조치 이력 */}
                <div className="bg-[#1a1d22] border border-[#282c34] rounded-lg p-5 space-y-3">
                  <h3 className="text-base font-bold text-[#f1f3f5]">최근 관제 조치 이력</h3>
                  <div className="space-y-2 max-h-[260px] overflow-y-auto custom-scrollbar">
                    {actionLogs.map((act) => (
                      <div
                        key={act.id}
                        className="p-3 bg-[#131519] border border-[#262a32] rounded-md text-xs text-[#d1d5db] leading-relaxed"
                      >
                        <span className="text-[#60a5fa] font-mono font-semibold mr-2">[{act.time}]</span>
                        {act.msg}
                      </div>
                    ))}
                    {HISTORICAL_LOGS.map((h) => (
                      <div
                        key={h.id}
                        className="p-3 bg-[#131519] border border-[#262a32] rounded-md flex items-center justify-between text-xs"
                      >
                        <div>
                          <span className="font-semibold text-[#e5e7eb]">{h.type}</span>
                          <span className="text-[#8b929e] font-mono ml-2">({h.cam})</span>
                        </div>
                        <span className="text-[#8b929e]">
                          {h.note} · {h.time}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 우측 7칸: events.jsonl 로그 테이블 */}
              <div className="col-span-12 xl:col-span-7 bg-[#1a1d22] border border-[#282c34] rounded-lg p-5 flex flex-col">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 mb-3.5 border-b border-[#262a32]">
                  <h3 className="text-base font-bold text-[#f1f3f5]">
                    events.jsonl 추적 · 위험 로그 ({backendData?.total_events || 0}건)
                  </h3>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {[
                      { id: 'ALL', label: '전체' },
                      { id: 'hazard_start', label: '위험 시작' },
                      { id: 'stationary', label: '정지 감지' },
                      { id: 'zone_change', label: '구역 변경' }
                    ].map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setBackendFilter(f.id)}
                        className={`px-3 py-1.5 rounded text-xs font-semibold cursor-pointer transition-colors ${
                          backendFilter === f.id
                            ? 'bg-[#2563eb] text-white'
                            : 'bg-[#131519] text-[#9ca3af] border border-[#282c34] hover:text-white'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar max-h-[620px]">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-[#15171b] border-b border-[#282c34] text-xs font-semibold text-[#8b929e]">
                      <tr>
                        <th className="py-3 px-3.5">프레임 (시각)</th>
                        <th className="py-3 px-3.5">이벤트</th>
                        <th className="py-3 px-3.5">추적 ID · 객체</th>
                        <th className="py-3 px-3.5">ROI 구역</th>
                        <th className="py-3 px-3.5">상세</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#22262e] text-sm">
                      {(backendData?.events || [])
                        .filter((ev) => backendFilter === 'ALL' || ev.event === backendFilter)
                        .map((ev, idx) => (
                          <tr key={idx} className="hover:bg-[#1f232b]">
                            <td className="py-2.5 px-3.5 font-mono text-xs text-[#9ca3af]">
                              #{ev.frame} ({((ev.video_ms || 0) / 1000).toFixed(1)}s)
                            </td>
                            <td className="py-2.5 px-3.5">
                              <span
                                className={`px-2 py-0.5 rounded text-xs font-mono font-semibold ${
                                  ev.event === 'hazard_start'
                                    ? 'bg-[#dc2626]/20 text-[#f87171]'
                                    : ev.event === 'stationary' || ev.event === 'moved'
                                    ? 'bg-[#d97706]/20 text-[#fbbf24]'
                                    : ev.event === 'zone_change'
                                    ? 'bg-[#2563eb]/20 text-[#93c5fd]'
                                    : 'bg-[#242830] text-[#9ca3af]'
                                }`}
                              >
                                {ev.event}
                              </span>
                            </td>
                            <td className="py-2.5 px-3.5 font-mono text-xs font-semibold text-[#f1f3f5]">
                              #{ev.track_id} {ev.class_name} ({ev.confidence})
                            </td>
                            <td className="py-2.5 px-3.5 text-xs text-[#fcd34d]">
                              {ev.from_zone ? `${ev.from_zone} -> ${ev.to_zone}` : ev.zone || '구역 외'}
                            </td>
                            <td className="py-2.5 px-3.5 text-xs text-[#d1d5db]">
                              {ev.hazard_ko || (ev.stationary_s ? `정지 유지 ${ev.stationary_s}s` : '-')}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </main>
        )}
      </div>

      {/* ==================== 빠른 확대 모달: 원본 / 보정 비교 ==================== */}
      {inspectModalCam && (
        <div
          onClick={() => setInspectModalCamId(null)}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#1a1d22] border border-[#343a44] rounded-lg max-w-5xl w-full p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-[#262a32] pb-3.5">
              <div className="flex items-center gap-3">
                <span className="px-2 py-0.5 bg-[#1e2636] text-[#93c5fd] text-xs font-semibold rounded border border-[#3b82f6]/40">
                  화질 비교
                </span>
                <h3 className="text-lg font-bold text-[#f1f3f5]">
                  {inspectModalCam.id} · {inspectModalCam.subLabel}
                </h3>
              </div>
              <button
                onClick={() => setInspectModalCamId(null)}
                className="p-1.5 text-[#8b929e] hover:text-white rounded hover:bg-[#262a32] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative aspect-video bg-black border border-[#323842] overflow-hidden select-none rounded-md">
              <video
                src={inspectModalCam.videoUrl}
                poster={inspectModalCam.posterUrl}
                autoPlay
                loop
                muted
                playsInline
                style={{ filter: inspectModalCam.enhancedFilter }}
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div
                style={{ clipPath: `inset(0 ${100 - splitSliderPos}% 0 0)` }}
                className="absolute inset-0"
              >
                <video
                  src={inspectModalCam.videoUrl}
                  poster={inspectModalCam.posterUrl}
                  autoPlay
                  loop
                  muted
                  playsInline
                  style={{ filter: inspectModalCam.rawFilter }}
                  className="w-full h-full object-cover"
                />
              </div>
              <div
                style={{ left: `${splitSliderPos}%` }}
                className="absolute top-0 bottom-0 w-0.5 bg-[#3b82f6] pointer-events-none"
              >
                <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 px-2.5 py-1 bg-[#2563eb] text-white text-xs font-bold rounded shadow whitespace-nowrap">
                  원본 | 보정
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 bg-[#131519] border border-[#262a32] px-4 py-2.5 rounded-md">
              <span className="text-sm font-semibold text-[#d1d5db]">비교 경계선</span>
              <input
                type="range"
                min="5"
                max="95"
                value={splitSliderPos}
                onChange={(e) => setSplitSliderPos(Number(e.target.value))}
                className="flex-1 accent-[#2563eb] cursor-pointer"
              />
              <span className="text-sm font-mono font-bold text-[#93c5fd] w-10 text-right">
                {splitSliderPos}%
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="text-sm text-[#d1d5db]">
                <strong className="text-[#fbbf24]">권고 조치: </strong>
                {inspectModalCam.sopRecommended}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleManualEnhanceRequest(inspectModalCam)}
                  className="px-3.5 py-2 bg-[#1d4ed8] hover:bg-[#2563eb] text-white text-sm font-semibold rounded-md cursor-pointer"
                >
                  수동 화질 개선 요청
                </button>
                <button
                  onClick={() => {
                    handleSopAction('119·경찰 긴급 출동 요청', inspectModalCam);
                    setInspectModalCamId(null);
                  }}
                  className="px-3.5 py-2 bg-[#b91c1c] hover:bg-[#dc2626] text-white text-sm font-bold rounded-md cursor-pointer"
                >
                  119·경찰 호출
                </button>
                <button
                  onClick={() => {
                    handleSopAction(`${inspectModalCam.vmsId} 연동`, inspectModalCam);
                    setInspectModalCamId(null);
                  }}
                  className="px-3.5 py-2 bg-[#22262e] hover:bg-[#2c313b] border border-[#343a44] text-white text-sm font-semibold rounded-md cursor-pointer"
                >
                  VMS 송출
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 서브 컴포넌트 1: OpenStreetMap 한글 도로 타일 + 다크 필터 / 위성 지도
// ============================================================================
const TILE_PROVIDERS = {
  DARK: {
    name: '다크 관제 지도',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    darkFilter: true
  },
  STREET: {
    name: '상세 도로 지도',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    darkFilter: false
  },
  SATELLITE: {
    name: '위성 지도',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
    darkFilter: false
  }
};

function computeFovPolygon(lat, lng, angleDeg, radiusDeg = 0.0022, spreadDeg = 44) {
  const toRad = (d) => (d * Math.PI) / 180;
  const startAngle = angleDeg - spreadDeg / 2;
  const endAngle = angleDeg + spreadDeg / 2;
  const pts = [[lat, lng]];
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const a = toRad(startAngle + ((endAngle - startAngle) * i) / steps);
    const dLat = radiusDeg * Math.cos(a);
    const dLng = (radiusDeg * Math.sin(a)) / Math.cos(toRad(lat));
    pts.push([lat + dLat, lng + dLng]);
  }
  return pts;
}

function TechnicalGisMap({ cameras, selectedCam, onSelectCam, layers }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const overlayGroupRef = useRef(null);
  const [tileMode, setTileMode] = useState('DARK');

  useEffect(() => {
    const L = window.L;
    if (!L || !mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [35.8695, 128.5995],
      zoom: 14,
      zoomControl: false
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const provider = TILE_PROVIDERS[tileMode];
    tileLayerRef.current = L.tileLayer(provider.url, {
      attribution: provider.attribution,
      maxZoom: 19
    }).addTo(map);

    overlayGroupRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const L = window.L;
    const map = mapInstanceRef.current;
    if (!L || !map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }
    const provider = TILE_PROVIDERS[tileMode];
    tileLayerRef.current = L.tileLayer(provider.url, {
      attribution: provider.attribution,
      maxZoom: 19
    }).addTo(map);
  }, [tileMode]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !selectedCam) return;
    const lat = parseFloat(selectedCam.lat);
    const lng = parseFloat(selectedCam.lng);
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      map.flyTo([lat, lng], Math.max(map.getZoom(), 15), { duration: 0.7 });
    }
  }, [selectedCam?.id]);

  useEffect(() => {
    const L = window.L;
    const group = overlayGroupRef.current;
    if (!L || !group) return;

    group.clearLayers();

    if (layers.floodZone) {
      L.polygon(
        [
          [35.8782, 128.5835],
          [35.8782, 128.5895],
          [35.8745, 128.5895],
          [35.8745, 128.5835]
        ],
        {
          color: '#d97706',
          weight: 1.5,
          dashArray: '5 4',
          fillColor: '#d97706',
          fillOpacity: 0.12
        }
      )
        .bindTooltip('어린이보호구역', { sticky: true, direction: 'top' })
        .addTo(group);

      L.polygon(
        [
          [35.8785, 128.6095],
          [35.8785, 128.6155],
          [35.8715, 128.6145],
          [35.8715, 128.6085]
        ],
        {
          color: '#3b82f6',
          weight: 1.5,
          dashArray: '5 4',
          fillColor: '#3b82f6',
          fillOpacity: 0.14
        }
      )
        .bindTooltip('신천 하상도로 침수취약구역', { sticky: true, direction: 'top' })
        .addTo(group);

      L.polygon(
        [
          [35.868, 128.5855],
          [35.868, 128.592],
          [35.8635, 128.592],
          [35.8635, 128.5855]
        ],
        {
          color: '#eab308',
          weight: 1.5,
          dashArray: '5 4',
          fillColor: '#eab308',
          fillOpacity: 0.11
        }
      )
        .bindTooltip('산업단지 진입 간선구간', { sticky: true, direction: 'top' })
        .addTo(group);
    }

    cameras.forEach((cam, index) => {
      const lat = parseFloat(cam.lat);
      const lng = parseFloat(cam.lng);
      if (Number.isNaN(lat) || Number.isNaN(lng)) return;

      const isSelected = cam.id === selectedCam.id;
      const isMonitored = index < 4;
      const isAlert = cam.level === 'L3' || cam.level === 'L2' || cam.level === 'CAM_WARN';
      const color =
        cam.level === 'L3'
          ? '#dc2626'
          : cam.level === 'L2' || cam.level === 'CAM_WARN'
          ? '#d97706'
          : '#3b82f6';

      if (layers.heatmap && isAlert) {
        L.circle([lat, lng], {
          radius: cam.level === 'L3' ? 230 : 160,
          color,
          weight: isSelected ? 1.8 : 1,
          fillColor: color,
          fillOpacity: isSelected ? 0.24 : 0.14
        }).addTo(group);
      }

      if (layers.fov) {
        const fovCoords = computeFovPolygon(lat, lng, cam.fovAngle, 0.0024, 48);
        L.polygon(fovCoords, {
          color,
          weight: 1,
          fillColor: color,
          fillOpacity: isSelected ? 0.3 : 0.18
        }).addTo(group);
      }

      const badgeStyle = isSelected
        ? 'background:#2563eb;color:#ffffff;border:1.5px solid #93c5fd;'
        : cam.level === 'L3'
        ? 'background:rgba(21,23,27,0.95);color:#fca5a5;border:1.5px solid #dc2626;'
        : cam.level === 'L2' || cam.level === 'CAM_WARN'
        ? 'background:rgba(21,23,27,0.95);color:#fde68a;border:1.5px solid #d97706;'
        : 'background:rgba(21,23,27,0.92);color:#d1d5db;border:1px solid #3f4552;';

      const dotColor =
        cam.level === 'L3'
          ? '#dc2626'
          : cam.level === 'L2' || cam.level === 'CAM_WARN'
          ? '#d97706'
          : '#6b7280';

      const html = `
        <div style="display:flex;align-items:center;gap:6px;white-space:nowrap;cursor:pointer;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.55));">
          <span style="width:12px;height:12px;border-radius:9999px;background:${dotColor};border:2px solid #ffffff;display:inline-block;flex-shrink:0;"></span>
          <span style="padding:3px 8px;border-radius:4px;font-size:12px;font-weight:700;${badgeStyle}">
            ${isMonitored ? `[K${index + 1}] ` : ''}${cam.shortId} · ${cam.eventType} (${cam.finalRisk})
          </span>
        </div>
      `;

      const icon = L.divIcon({
        className: 'cctv-gis-marker',
        html,
        iconSize: [180, 28],
        iconAnchor: [10, 14]
      });

      const marker = L.marker([lat, lng], {
        icon,
        zIndexOffset: isSelected ? 1000 : isMonitored ? 500 : 100
      });

      marker.on('click', () => onSelectCam(cam.id));
      marker.addTo(group);
    });
  }, [cameras, selectedCam, layers]);

  const handleResetBounds = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.flyTo([35.8695, 128.5995], 14, { duration: 0.7 });
  };

  return (
    <div
      className={`relative w-full h-full min-h-[600px] select-none ${
        TILE_PROVIDERS[tileMode]?.darkFilter ? 'gis-dark-tiles' : ''
      }`}
    >
      <div ref={mapContainerRef} className="w-full h-full min-h-[600px] z-10" />

      {/* 좌상단 지도 스타일 전환 */}
      <div className="absolute top-3.5 left-3.5 z-[400] flex flex-wrap items-center gap-2">
        <div className="bg-[#15171b]/95 border border-[#2f343e] p-1 rounded-md flex items-center gap-1 shadow-lg">
          {Object.entries(TILE_PROVIDERS).map(([key, item]) => (
            <button
              key={key}
              onClick={() => setTileMode(key)}
              className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer transition-colors ${
                tileMode === key
                  ? 'bg-[#2563eb] text-white'
                  : 'text-[#d1d5db] hover:text-white hover:bg-[#22262e]'
              }`}
            >
              {item.name}
            </button>
          ))}
        </div>

        <button
          onClick={handleResetBounds}
          className="px-3 py-1.5 bg-[#15171b]/95 hover:bg-[#22262e] border border-[#2f343e] text-xs font-semibold text-[#e5e7eb] rounded-md shadow-lg cursor-pointer transition-colors"
        >
          전체 구역 보기
        </button>
      </div>

      {/* 좌하단 범례 */}
      <div className="absolute bottom-3.5 left-3.5 z-[400] bg-[#15171b]/95 border border-[#2f343e] px-3.5 py-2 rounded-md text-xs text-[#d1d5db] flex flex-wrap items-center gap-4 shadow-lg">
        <span className="flex items-center gap-1.5 font-medium">
          <span className="w-2.5 h-2.5 rounded-full bg-[#dc2626] inline-block" /> L3 긴급
        </span>
        <span className="flex items-center gap-1.5 font-medium">
          <span className="w-2.5 h-2.5 rounded-full bg-[#d97706] inline-block" /> L2 주의 · 점검
        </span>
        <span className="flex items-center gap-1.5 text-[#9ca3af]">
          <span className="w-2.5 h-2.5 rounded-full bg-[#6b7280] inline-block" /> 정상
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// 서브 컴포넌트 2: 관제형 시계열 위험도 차트
// ============================================================================
function ModernDarkTimeSeriesChart({ data, cursor, onSelectSec }) {
  const width = 720;
  const height = 240;
  const padL = 42;
  const padR = 20;
  const padT = 20;
  const padB = 38;

  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const x = (sec) => padL + (sec / 150) * plotW;
  const y = (val) => padT + plotH - val * plotH;

  const makeLine = (key) =>
    data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(d.s).toFixed(1)} ${y(d[key]).toFixed(1)}`).join(' ');

  return (
    <div className="bg-[#131519] border border-[#262a32] rounded-md p-4 select-none">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto cursor-crosshair"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const clickX = ((e.clientX - rect.left) / rect.width) * width;
          const sec = Math.max(0, Math.min(150, Math.round(((clickX - padL) / plotW) * 150)));
          onSelectSec(sec);
        }}
      >
        {[0.25, 0.5, 0.75, 1.0].map((v) => (
          <g key={v}>
            <line
              x1={padL}
              x2={width - padR}
              y1={y(v)}
              y2={y(v)}
              stroke="#242830"
              strokeWidth="1"
            />
            <text x={padL - 8} y={y(v) + 4} textAnchor="end" className="fill-[#717885] text-[11px] font-mono">
              {v.toFixed(2)}
            </text>
          </g>
        ))}

        <rect
          x={x(64)}
          y={padT}
          width={x(115) - x(64)}
          height={plotH}
          fill="rgba(220, 38, 38, 0.08)"
        />

        <line
          x1={padL}
          x2={width - padR}
          y1={y(0.75)}
          y2={y(0.75)}
          stroke="#dc2626"
          strokeWidth="1.2"
          strokeDasharray="4 4"
        />

        <path d={makeLine('group')} fill="none" stroke="#60a5fa" strokeWidth="1.8" />
        <path d={makeLine('fight')} fill="none" stroke="#fbbf24" strokeWidth="1.8" />
        <path d={makeLine('fall')} fill="none" stroke="#ef4444" strokeWidth="2.4" />

        <line
          x1={x(cursor)}
          x2={x(cursor)}
          y1={padT}
          y2={padT + plotH}
          stroke="#e5e7eb"
          strokeWidth="1.5"
        />

        {[0, 25, 50, 75, 100, 125, 150].map((s) => (
          <text
            key={s}
            x={x(s)}
            y={height - 10}
            textAnchor="middle"
            className="fill-[#8b929e] text-[11px] font-mono"
          >
            {s}s
          </text>
        ))}
      </svg>

      <div className="flex flex-wrap items-center justify-center gap-6 pt-3 border-t border-[#22262e] text-xs text-[#d1d5db]">
        <span className="flex items-center gap-2 font-semibold text-[#f87171]">
          <span className="w-3.5 h-0.5 bg-[#ef4444] inline-block" /> 보행자 쓰러짐 (E02_009)
        </span>
        <span className="flex items-center gap-2 text-[#fbbf24]">
          <span className="w-3.5 h-0.5 bg-[#fbbf24] inline-block" /> 시설물이탈 (E02_045)
        </span>
        <span className="flex items-center gap-2 text-[#93c5fd]">
          <span className="w-3.5 h-0.5 bg-[#60a5fa] inline-block" /> 인파밀집 · 적치물 (E05_006)
        </span>
      </div>
    </div>
  );
}
