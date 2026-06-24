import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Filter, CheckCircle, MapPin, Loader2, RefreshCw } from 'lucide-react';

// High-contrast vibrant colors for better visibility
const getMarkerColor = (surveyor: string) => {
  const colors: Record<string, string> = {
    '정은진': '#ef4444', // Red-500
    '노기섭': '#f59e0b', // Amber-500
    '이승수': '#3b82f6', // Blue-500
  };
  return colors[surveyor] || '#6b7280'; // Gray-500 fallback
};

const createCustomIcon = (surveyor: string, isCompleted: boolean, showLabel: boolean) => {
  const color = getMarkerColor(surveyor);
  const opacity = isCompleted ? '0.4' : '1';
  
  const svgPin = `
    <svg width="40" height="50" viewBox="0 0 40 50" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.4));">
      <path d="M20 0C8.95431 0 0 8.95431 0 20C0 31.0457 20 50 20 50C20 50 40 31.0457 40 20C40 8.95431 31.0457 0 20 0Z" fill="${color}" fill-opacity="${opacity}"/>
      <circle cx="20" cy="20" r="8" fill="white" fill-opacity="${opacity}"/>
    </svg>
  `;

  return L.divIcon({
    html: `
      <div style="position: relative; display: flex; flex-direction: column; align-items: center; width: 40px;">
        <div style="width: 40px; height: 50px;">
          ${svgPin}
        </div>
        ${showLabel && !isCompleted ? `
          <div style="
            position: absolute;
            top: 52px;
            background-color: white;
            padding: 2px 8px;
            border-radius: 6px;
            border: 2px solid ${color};
            font-size: 12px;
            font-weight: 900;
            white-space: nowrap;
            box-shadow: 0 2px 6px rgba(0,0,0,0.2);
            color: #111;
            z-index: 10;
          ">${surveyor}</div>
        ` : ''}
      </div>
    `,
    className: 'custom-survey-marker',
    iconSize: [40, 70],
    iconAnchor: [20, 50],
    popupAnchor: [0, -45],
  });
};

interface Survey {
  id: number;
  status: string | null;
  name: string;
  address: string;
  surveyor: string;
  lat: number | null;
  lng: number | null;
  chargerStatus?: string;
  operatingAgency?: string;
  chargerType?: string;
  chargerCapacity?: string;
  detailLocation?: string;
}

function MapController({ center, setZoom }: { center: [number, number], setZoom: (z: number) => void }) {
  const map = useMap();
  
  useEffect(() => {
    map.setView(center);
    setZoom(map.getZoom());
  }, [center, map, setZoom]);

  useEffect(() => {
    const handleZoom = () => setZoom(map.getZoom());
    map.on('zoomend', handleZoom);
    return () => {
      map.off('zoomend', handleZoom);
    };
  }, [map, setZoom]);

  return null;
}

function App() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [vworldKey, setVworldKey] = useState<string>('');
  const [selectedSurveyor, setSelectedSurveyor] = useState<string>('all');
  const [mapCenter, setMapCenter] = useState<[number, number]>([35.1595, 126.8526]);
  const [currentZoom, setCurrentZoom] = useState(15);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [configRes, surveysRes] = await Promise.all([
        fetch('/api/config'),
        fetch('/api/surveys')
      ]);
      
      const config = await configRes.json();
      const data = await surveysRes.json();
      
      setVworldKey(config.vworldKey);
      setSurveys(data);
      
      const firstValid = data.find((s: Survey) => s.lat && s.lng);
      if (firstValid) {
        setMapCenter([firstValid.lat, firstValid.lng]);
      }
    } catch (e) {
      console.error("Failed to fetch data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleComplete = async (id: number) => {
    if (!confirm('조사 완료로 처리하시겠습니까?')) return;
    
    try {
      const res = await fetch(`/api/surveys/${id}/complete`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        setSurveys(prev => prev.map(s => s.id === id ? { ...s, status: '완료' } : s));
      } else {
        const err = await res.json();
        alert(`업데이트 실패: ${err.error}`);
      }
    } catch (e) {
      console.error("Failed to update status:", e);
      alert('오류가 발생했습니다.');
    }
  };

  const surveyors = ['all', ...new Set(surveys.map(s => s.surveyor).filter(Boolean))];
  
  const getSurveyorStats = (name: string) => {
    const relevant = surveys.filter(s => s.surveyor === name);
    return {
      total: relevant.length,
      completed: relevant.filter(s => s.status === '완료').length
    };
  };

  const filteredSurveys = selectedSurveyor === 'all' 
    ? surveys 
    : surveys.filter(s => s.surveyor === selectedSurveyor);

  const showLabels = currentZoom >= 15;

  return (
    <div className="flex flex-col h-full w-full font-sans text-gray-900 bg-gray-50">
      <header className="bg-white/80 backdrop-blur-md shadow-sm z-[1000] px-6 py-4 flex justify-between items-center border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-600 rounded-lg shadow-blue-200 shadow-lg">
            <MapPin className="text-white" size={20} />
          </div>
          <h1 className="text-xl font-black tracking-tight text-gray-800 ml-2">조사 위치 확인</h1>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white rounded-xl px-4 py-2 border border-gray-200 shadow-sm">
            <Filter size={14} className="text-gray-400" />
            <select 
              className="bg-transparent border-none focus:ring-0 text-sm font-bold text-gray-700"
              value={selectedSurveyor}
              onChange={(e) => setSelectedSurveyor(e.target.value)}
            >
              {surveyors.map(name => (
                <option key={name} value={name}>
                  {name === 'all' ? '모든 조사자' : name}
                </option>
              ))}
            </select>
          </div>
          
          <button 
            onClick={fetchData}
            className="p-2.5 hover:bg-gray-50 rounded-xl border border-gray-200 transition-all bg-white shadow-sm active:scale-95"
            title="새로고침"
          >
            <RefreshCw size={18} className={loading ? "animate-spin text-blue-600" : "text-gray-600"} />
          </button>
        </div>
      </header>

      <main className="flex-1 relative overflow-hidden">
        {loading && (
          <div className="absolute inset-0 bg-white/40 backdrop-blur-[4px] z-[2000] flex items-center justify-center">
            <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-4">
              <Loader2 className="animate-spin text-blue-600" size={48} />
              <p className="font-bold text-gray-800 text-lg">데이터 분석 중...</p>
            </div>
          </div>
        )}

        <MapContainer center={mapCenter} zoom={15} scrollWheelZoom={true} className="z-0">
          <MapController center={mapCenter} setZoom={setCurrentZoom} />
          
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {vworldKey && (
            <TileLayer
              attribution='&copy; <a href="http://www.vworld.kr/">VWORLD</a>'
              url={`https://api.vworld.kr/req/wmts/1.0.0/${vworldKey}/gray/{z}/{y}/{x}.png`}
              zIndex={10}
            />
          )}
          
          {filteredSurveys.map(survey => {
            if (!survey.lat || !survey.lng) return null;
            const isCompleted = survey.status === '완료';
            return (
              <Marker 
                key={survey.id} 
                position={[survey.lat, survey.lng]} 
                icon={createCustomIcon(survey.surveyor, isCompleted, showLabels)}
              >
                <Popup className="custom-popup">
                  <div className="p-3 min-w-[240px]">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-md">ID: {survey.id}</span>
                      <span className={`text-[10px] font-black px-2 py-1 rounded-md ${
                        isCompleted ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-600'
                      }`}>
                        {isCompleted ? '완료됨' : '진행 대기'}
                      </span>
                    </div>
                    <h3 className="font-bold text-base mb-1 text-gray-900 whitespace-pre-line">{survey.name}</h3>
                    <p className="text-xs text-gray-500 mb-3 leading-relaxed">{survey.address}</p>
                    
                    <div className="bg-gray-50 rounded-lg p-2 mb-3 space-y-1.5 border border-gray-100">
                      {(survey.chargerStatus || survey.operatingAgency) && (
                        <div className="flex flex-col gap-1 mb-2 pb-2 border-b border-gray-200/60">
                          {survey.chargerStatus && <div className="text-xs"><span className="font-bold text-gray-600">상태:</span> {survey.chargerStatus}</div>}
                          {survey.operatingAgency && <div className="text-xs"><span className="font-bold text-gray-600">기관:</span> {survey.operatingAgency}</div>}
                        </div>
                      )}
                      {survey.chargerType && <div className="text-[11px] text-gray-600"><span className="font-semibold text-gray-500">타입:</span> {survey.chargerType}</div>}
                      {survey.chargerCapacity && <div className="text-[11px] text-gray-600"><span className="font-semibold text-gray-500">용량:</span> {survey.chargerCapacity}</div>}
                      {survey.detailLocation && <div className="text-[11px] text-gray-600"><span className="font-semibold text-gray-500">위치:</span> {survey.detailLocation}</div>}
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                      <div className="flex flex-col">
                        <span className="text-[9px] text-gray-400 font-bold uppercase">담당자</span>
                        <span className="text-sm font-bold text-gray-700">{survey.surveyor}</span>
                      </div>
                      
                      {!isCompleted && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleComplete(survey.id);
                          }}
                          className="bg-gray-900 hover:bg-black text-white text-xs px-4 py-2 rounded-lg font-bold transition-all"
                        >
                          완료 처리
                        </button>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
        
        <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md p-5 rounded-2xl shadow-xl z-[1000] border border-white/50 min-w-[160px]">
          <div className="flex flex-col gap-4">
            <div>
              <h4 className="text-[10px] font-black text-gray-400 mb-3 uppercase tracking-widest">조사자 별 현황</h4>
              <div className="flex flex-col gap-2.5">
                {surveyors.filter(name => name !== 'all').map(name => {
                  const stats = getSurveyorStats(name);
                  return (
                    <div key={name} className="flex items-center gap-3">
                      <div 
                        className="w-3.5 h-3.5 rounded-full shadow-sm ring-2 ring-white"
                        style={{ backgroundColor: getMarkerColor(name) }}
                      ></div>
                      <span className="text-xs font-bold text-gray-700">
                        {name} <span className="text-[10px] text-gray-400 font-normal ml-1">({stats.completed}/{stats.total})</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none">
          <div className="bg-gray-900/80 backdrop-blur-sm text-white px-4 py-2 rounded-full text-[11px] font-bold shadow-2xl">
            {filteredSurveys.length}개의 지점 표시 중
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
