/**
 * 國泰航空 — 真實航線資料庫
 * destinationName     : Globe 覆蓋層顯示名（中文城市用繁體中文）
 * destinationNameBoard: 翻牌棋盤用名（純英文大寫，供 Split-Flap Board 字符滾動）
 * 所有航班均以香港國際機場（HKG）為出發地
 */
const destinations = [

  // ── 東北亞 ──────────────────────────────────────────────────
  {
    flightNo: 'CX548', origin: 'HKG', originName: '香港',
    originCoords: { lat: 22.3080, lng: 113.9185 },
    destination: 'HND', destinationName: '東京', destinationNameBoard: 'TOKYO',
    destCoords: { lat: 35.5494, lng: 139.7798 },
    gate: '05', status: 'BOARDING'
  },
  {
    flightNo: 'CX564', origin: 'HKG', originName: '香港',
    originCoords: { lat: 22.3080, lng: 113.9185 },
    destination: 'KIX', destinationName: '大阪', destinationNameBoard: 'OSAKA',
    destCoords: { lat: 34.4272, lng: 135.2440 },
    gate: '07', status: 'ON TIME'
  },
  {
    flightNo: 'CX410', origin: 'HKG', originName: '香港',
    originCoords: { lat: 22.3080, lng: 113.9185 },
    destination: 'ICN', destinationName: '首爾', destinationNameBoard: 'SEOUL',
    destCoords: { lat: 37.4602, lng: 126.4407 },
    gate: '11', status: 'BOARDING'
  },

  // ── 兩岸三地 ────────────────────────────────────────────────
  {
    flightNo: 'CX450', origin: 'HKG', originName: '香港',
    originCoords: { lat: 22.3080, lng: 113.9185 },
    destination: 'TPE', destinationName: '台北', destinationNameBoard: 'TAIPEI',
    destCoords: { lat: 25.0777, lng: 121.2327 },
    gate: '15', status: 'BOARDING'
  },
  {
    flightNo: 'CX361', origin: 'HKG', originName: '香港',
    originCoords: { lat: 22.3080, lng: 113.9185 },
    destination: 'PEK', destinationName: '北京', destinationNameBoard: 'BEIJING',
    destCoords: { lat: 40.0801, lng: 116.5846 },
    gate: '22', status: 'ON TIME'
  },
  {
    flightNo: 'CX391', origin: 'HKG', originName: '香港',
    originCoords: { lat: 22.3080, lng: 113.9185 },
    destination: 'PVG', destinationName: '上海', destinationNameBoard: 'SHANGHAI',
    destCoords: { lat: 31.1434, lng: 121.8052 },
    gate: '18', status: 'ON TIME'
  },
  {
    flightNo: 'CX371', origin: 'HKG', originName: '香港',
    originCoords: { lat: 22.3080, lng: 113.9185 },
    destination: 'CAN', destinationName: '廣州', destinationNameBoard: 'GUANGZHOU',
    destCoords: { lat: 23.3924, lng: 113.2988 },
    gate: '09', status: 'BOARDING'
  },
  {
    flightNo: 'CX345', origin: 'HKG', originName: '香港',
    originCoords: { lat: 22.3080, lng: 113.9185 },
    destination: 'CTU', destinationName: '成都', destinationNameBoard: 'CHENGDU',
    destCoords: { lat: 30.5785, lng: 103.9470 },
    gate: '14', status: 'ON TIME'
  },
  {
    flightNo: 'CX379', origin: 'HKG', originName: '香港',
    originCoords: { lat: 22.3080, lng: 113.9185 },
    destination: 'XMN', destinationName: '廈門', destinationNameBoard: 'XIAMEN',
    destCoords: { lat: 24.5440, lng: 118.1277 },
    gate: '06', status: 'ON TIME'
  },
  {
    flightNo: 'CX349', origin: 'HKG', originName: '香港',
    originCoords: { lat: 22.3080, lng: 113.9185 },
    destination: 'WUH', destinationName: '武漢', destinationNameBoard: 'WUHAN',
    destCoords: { lat: 30.7838, lng: 114.2081 },
    gate: '21', status: 'BOARDING'
  },

  // ── 東南亞 ──────────────────────────────────────────────────
  {
    flightNo: 'CX713', origin: 'HKG', originName: '香港',
    originCoords: { lat: 22.3080, lng: 113.9185 },
    destination: 'SIN', destinationName: 'Singapore', destinationNameBoard: 'SINGAPORE',
    destCoords: { lat: 1.3644, lng: 103.9915 },
    gate: '31', status: 'BOARDING'
  },
  {
    flightNo: 'CX700', origin: 'HKG', originName: '香港',
    originCoords: { lat: 22.3080, lng: 113.9185 },
    destination: 'BKK', destinationName: 'Bangkok', destinationNameBoard: 'BANGKOK',
    destCoords: { lat: 13.6811, lng: 100.7472 },
    gate: '28', status: 'ON TIME'
  },
  {
    flightNo: 'CX747', origin: 'HKG', originName: '香港',
    originCoords: { lat: 22.3080, lng: 113.9185 },
    destination: 'KUL', destinationName: 'Kuala Lumpur', destinationNameBoard: 'KUALA LUMPUR',
    destCoords: { lat: 2.7456, lng: 101.7100 },
    gate: '34', status: 'ON TIME'
  },
  {
    flightNo: 'CX780', origin: 'HKG', originName: '香港',
    originCoords: { lat: 22.3080, lng: 113.9185 },
    destination: 'MNL', destinationName: 'Manila', destinationNameBoard: 'MANILA',
    destCoords: { lat: 14.5086, lng: 121.0197 },
    gate: '12', status: 'BOARDING'
  },
  {
    flightNo: 'CX735', origin: 'HKG', originName: '香港',
    originCoords: { lat: 22.3080, lng: 113.9185 },
    destination: 'CGK', destinationName: 'Jakarta', destinationNameBoard: 'JAKARTA',
    destCoords: { lat: -6.1256, lng: 106.6559 },
    gate: '33', status: 'ON TIME'
  },
  {
    flightNo: 'CX795', origin: 'HKG', originName: '香港',
    originCoords: { lat: 22.3080, lng: 113.9185 },
    destination: 'HAN', destinationName: 'Hanoi', destinationNameBoard: 'HANOI',
    destCoords: { lat: 21.2187, lng: 105.8047 },
    gate: '27', status: 'ON TIME'
  },

  // ── 南亞 / 中東 ─────────────────────────────────────────────
  {
    flightNo: 'CX693', origin: 'HKG', originName: '香港',
    originCoords: { lat: 22.3080, lng: 113.9185 },
    destination: 'BOM', destinationName: 'Mumbai', destinationNameBoard: 'MUMBAI',
    destCoords: { lat: 19.0896, lng: 72.8656 },
    gate: '38', status: 'ON TIME'
  },
  {
    flightNo: 'CX616', origin: 'HKG', originName: '香港',
    originCoords: { lat: 22.3080, lng: 113.9185 },
    destination: 'DXB', destinationName: 'Dubai', destinationNameBoard: 'DUBAI',
    destCoords: { lat: 25.2532, lng: 55.3657 },
    gate: '42', status: 'ON TIME'
  },

  // ── 歐洲 ────────────────────────────────────────────────────
  {
    flightNo: 'CX251', origin: 'HKG', originName: '香港',
    originCoords: { lat: 22.3080, lng: 113.9185 },
    destination: 'LHR', destinationName: 'London', destinationNameBoard: 'LONDON',
    destCoords: { lat: 51.4700, lng: -0.4543 },
    gate: '62', status: 'ON TIME'
  },
  {
    flightNo: 'CX261', origin: 'HKG', originName: '香港',
    originCoords: { lat: 22.3080, lng: 113.9185 },
    destination: 'CDG', destinationName: 'Paris', destinationNameBoard: 'PARIS',
    destCoords: { lat: 49.0097, lng: 2.5479 },
    gate: '58', status: 'ON TIME'
  },
  {
    flightNo: 'CX289', origin: 'HKG', originName: '香港',
    originCoords: { lat: 22.3080, lng: 113.9185 },
    destination: 'FRA', destinationName: 'Frankfurt', destinationNameBoard: 'FRANKFURT',
    destCoords: { lat: 50.0379, lng: 8.5622 },
    gate: '60', status: 'ON TIME'
  },
  {
    flightNo: 'CX233', origin: 'HKG', originName: '香港',
    originCoords: { lat: 22.3080, lng: 113.9185 },
    destination: 'AMS', destinationName: 'Amsterdam', destinationNameBoard: 'AMSTERDAM',
    destCoords: { lat: 52.3086, lng: 4.7639 },
    gate: '55', status: 'BOARDING'
  },
  {
    flightNo: 'CX279', origin: 'HKG', originName: '香港',
    originCoords: { lat: 22.3080, lng: 113.9185 },
    destination: 'ZRH', destinationName: 'Zurich', destinationNameBoard: 'ZURICH',
    destCoords: { lat: 47.4647, lng: 8.5492 },
    gate: '57', status: 'ON TIME'
  },
  {
    flightNo: 'CX263', origin: 'HKG', originName: '香港',
    originCoords: { lat: 22.3080, lng: 113.9185 },
    destination: 'MXP', destinationName: 'Milan', destinationNameBoard: 'MILAN',
    destCoords: { lat: 45.6301, lng: 8.7231 },
    gate: '61', status: 'ON TIME'
  },

  // ── 北美洲 ──────────────────────────────────────────────────
  {
    flightNo: 'CX826', origin: 'HKG', originName: '香港',
    originCoords: { lat: 22.3080, lng: 113.9185 },
    destination: 'YYZ', destinationName: 'Toronto', destinationNameBoard: 'TORONTO',
    destCoords: { lat: 43.6777, lng: -79.6248 },
    gate: '23', status: 'BOARDING'
  },
  {
    flightNo: 'CX884', origin: 'HKG', originName: '香港',
    originCoords: { lat: 22.3080, lng: 113.9185 },
    destination: 'LAX', destinationName: 'Los Angeles', destinationNameBoard: 'LOS ANGELES',
    destCoords: { lat: 33.9416, lng: -118.4085 },
    gate: '19', status: 'BOARDING'
  },
  {
    flightNo: 'CX830', origin: 'HKG', originName: '香港',
    originCoords: { lat: 22.3080, lng: 113.9185 },
    destination: 'JFK', destinationName: 'New York', destinationNameBoard: 'NEW YORK',
    destCoords: { lat: 40.6413, lng: -73.7781 },
    gate: '25', status: 'ON TIME'
  },
  {
    flightNo: 'CX870', origin: 'HKG', originName: '香港',
    originCoords: { lat: 22.3080, lng: 113.9185 },
    destination: 'SFO', destinationName: 'San Francisco', destinationNameBoard: 'SAN FRANCISCO',
    destCoords: { lat: 37.6213, lng: -122.3790 },
    gate: '17', status: 'ON TIME'
  },
  {
    flightNo: 'CX838', origin: 'HKG', originName: '香港',
    originCoords: { lat: 22.3080, lng: 113.9185 },
    destination: 'YVR', destinationName: 'Vancouver', destinationNameBoard: 'VANCOUVER',
    destCoords: { lat: 49.1967, lng: -123.1815 },
    gate: '20', status: 'BOARDING'
  },
  {
    flightNo: 'CX880', origin: 'HKG', originName: '香港',
    originCoords: { lat: 22.3080, lng: 113.9185 },
    destination: 'ORD', destinationName: 'Chicago', destinationNameBoard: 'CHICAGO',
    destCoords: { lat: 41.9742, lng: -87.9073 },
    gate: '24', status: 'ON TIME'
  },

  // ── 大洋洲 ──────────────────────────────────────────────────
  {
    flightNo: 'CX101', origin: 'HKG', originName: '香港',
    originCoords: { lat: 22.3080, lng: 113.9185 },
    destination: 'SYD', destinationName: 'Sydney', destinationNameBoard: 'SYDNEY',
    destCoords: { lat: -33.9461, lng: 151.1772 },
    gate: '44', status: 'ON TIME'
  },
  {
    flightNo: 'CX109', origin: 'HKG', originName: '香港',
    originCoords: { lat: 22.3080, lng: 113.9185 },
    destination: 'MEL', destinationName: 'Melbourne', destinationNameBoard: 'MELBOURNE',
    destCoords: { lat: -37.6690, lng: 144.8410 },
    gate: '46', status: 'BOARDING'
  },
  {
    flightNo: 'CX197', origin: 'HKG', originName: '香港',
    originCoords: { lat: 22.3080, lng: 113.9185 },
    destination: 'AKL', destinationName: 'Auckland', destinationNameBoard: 'AUCKLAND',
    destCoords: { lat: -37.0082, lng: 174.7850 },
    gate: '48', status: 'ON TIME'
  }
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = destinations;
} else {
  window.destinations = destinations;
}
