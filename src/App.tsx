import React, { useEffect, useState } from 'react';
import { Map, CustomOverlayMap } from 'react-kakao-maps-sdk';
import { Filter, CheckCircle, MapPin, Loader2, RefreshCw, X } from 'lucide-react';

// High-contrast vibrant colors for better visibility
const getMarkerColor = (surveyor: string) => {
  const colors: Record<string, string> = {
    '정은진': '#ef4444', // Red-500
    '노기섭': '#f59e0b', // Amber-500
    '이승수': '#3b82f6', // Blue-500
  };
  return colors[surveyor] || '#6b7280'; // Gray-500 fallback
};

const createMarkerSvg = (surveyor: string, isCompleted: boolean) => {
  const color = getMarkerColor(surveyor);
  const opacity = isCompleted ? '0.4' : '1';
  
  return `
    <svg width="40" height="50" viewBox="0 0 40 50" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.4));">
      <path d="M20 0C8.95431 0 0 8.95431 0 20C0 31.0457 20 50 20 50C20 50 40 31.0457 40 20C40 8.95431 31.0457 0 20 0Z" fill="${color}" fill-opacity="${opacity}"/>
      <circle cx="20" cy="20" r="8" fill="white" fill-opacity="${opacity}"/>
    </svg>
  `;
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

function App() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSurveyor, setSelectedSurveyor] = useState<string>('all');
  const [mapCenter, setMapCenter] = useState({ lat: 35.1595, lng: 126.8526 });
  const [currentZoom, setCurrentZoom] = useState(4); // 카카오 줌레벨 (낮을수록 확대)
  const [selectedMarkerId, setSelectedMarkerId] = useState<number | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setSelectedMarkerId(null);
    try {
      const res = await fetch('/api/surveys');
      const data = await res.json();
      setSurveys(data);
      
      // 첫 데이터 로드 시 중심점 계산
      if (data.length > 0) {
        const validCoords = data.filter((s: Survey) => s.lat && s.lng);
        if (validCoords.length > 0) {
          // Calculate bounding box or simple average
          const avgLat = validCoords.reduce((sum: number, s: Survey) => sum + s.lat!, 0) / validCoords.length;
          const avgLng = validCoords.reduce((sum: number, s: Survey) => sum + s.lng!, 0) / validCoords.length;
          setMapCenter({ lat: avgLat, lng: avgLng });
        }
      }
    } catch (e) {
      console.error("Failed to fetch surveys:", e);
    }
    setLoading(false);
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
        setSelectedMarkerId(null); // 완료 처리 후 팝업 닫기
      } else {
        const err = await res.json();
        alert(`업데이트 실패: ${err.error}`);
      }
    } catch (e) {
      console.error("Failed to update status:", e);
      alert('오류가 발생했습니다.');
    }
  };

  const handleReset = async (id: number) => {
    if (!confirm('완료 상태를 취소하고 대기 상태로 되돌리시겠습니까?')) return;
    
    try {
      const res = await fetch(`/api/surveys/${id}/reset`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        setSurveys(prev => prev.map(s => s.id === id ? { ...s, status: '대기' } : s));
        setSelectedMarkerId(null); // 초기화 후 팝업 닫기
      } else {
        const err = await res.json();
        alert(`초기화 실패: ${err.error}`);
      }
    } catch (e) {
      console.error("Failed to reset status:", e);
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

  // 카카오 줌레벨은 1~14. 라벨은 줌 4 이하(확대 상태)일 때만 표시
  const showLabels = currentZoom <= 4;

  return (
    <div className="flex flex-col h-full w-full font-sans text-gray-900 bg-gray-50">
      <header className="bg-white/80 backdrop-blur-md shadow-sm z-[1000] px-6 py-4 flex justify-between items-center border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-yellow-400 rounded-lg shadow-yellow-200 shadow-lg">
            <MapPin className="text-gray-900" size={20} />
          </div>
          <h1 className="text-xl font-black tracking-tight text-gray-800 ml-2">카카오 조사 위치 확인</h1>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white rounded-xl px-4 py-2 border border-gray-200 shadow-sm">
            <Filter size={14} className="text-gray-400" />
            <select 
              className="bg-transparent border-none focus:ring-0 text-sm font-bold text-gray-700"
              value={selectedSurveyor}
              onChange={(e) => {
                setSelectedSurveyor(e.target.value);
                setSelectedMarkerId(null); // 필터 변경 시 팝업 닫기
              }}
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

        {/* 카카오맵 컴포넌트 */}
        <Map 
          center={mapCenter} 
          style={{ width: '100%', height: '100%' }}
          level={currentZoom}
          onZoomChanged={(map) => setCurrentZoom(map.getLevel())}
          onDragEnd={(map) => setMapCenter({ lat: map.getCenter().getLat(), lng: map.getCenter().getLng() })}
          onClick={() => setSelectedMarkerId(null)} // 빈 공간 클릭 시 팝업 닫기
        >
          {filteredSurveys.map(survey => {
            if (!survey.lat || !survey.lng) return null;
            const isCompleted = survey.status === '완료';
            const color = getMarkerColor(survey.surveyor);
            const isSelected = selectedMarkerId === survey.id;

            return (
              <React.Fragment key={survey.id}>
                {/* 커스텀 마커 핀 */}
                <CustomOverlayMap 
                  position={{ lat: survey.lat, lng: survey.lng }}
                  yAnchor={1} // 마커 핀 하단이 좌표에 위치하도록 설정
                  zIndex={isSelected ? 100 : 1}
                >
                  <div 
                    style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '40px', cursor: 'pointer' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedMarkerId(isSelected ? null : survey.id);
                    }}
                  >
                    <div style={{ width: '40px', height: '50px' }} dangerouslySetInnerHTML={{ __html: createMarkerSvg(survey.surveyor, isCompleted) }} />
                    
                    {showLabels && !isCompleted && !isSelected && (
                      <div style={{
                        position: 'absolute',
                        top: '52px',
                        backgroundColor: 'white',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        border: `2px solid ${color}`,
                        fontSize: '12px',
                        fontWeight: 900,
                        whiteSpace: 'nowrap',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                        color: '#111',
                        zIndex: 10,
                      }}>
                        {survey.surveyor}
                      </div>
                    )}
                  </div>
                </CustomOverlayMap>

                {/* 선택된 마커의 팝업 창 */}
                {isSelected && (
                  <CustomOverlayMap 
                    position={{ lat: survey.lat, lng: survey.lng }} 
                    yAnchor={1} 
                    zIndex={200}
                  >
                    <div 
                      className="bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col p-4 w-[280px]"
                      style={{ marginBottom: '60px' }} // 마커 위로 띄우기 위한 마진
                      onClick={(e) => e.stopPropagation()} // 클릭 이벤트 전파 방지
                    >
                      <button 
                        onClick={() => setSelectedMarkerId(null)}
                        className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-full p-1 transition-colors"
                      >
                        <X size={16} />
                      </button>

                      <div className="flex justify-between items-center mb-3 pr-6">
                        <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-md">ID: {survey.id}</span>
                        <span className={`text-[10px] font-black px-2 py-1 rounded-md ${
                          isCompleted ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-600'
                        }`}>
                          {isCompleted ? '완료됨' : '진행 대기'}
                        </span>
                      </div>
                      
                      <h3 className="font-bold text-base mb-1 text-gray-900 whitespace-pre-line">{survey.name}</h3>
                      <p className="text-xs text-gray-500 mb-3 leading-relaxed break-keep">{survey.address}</p>
                      
                      <div className="bg-gray-50 rounded-lg p-3 mb-4 space-y-2 border border-gray-100">
                        {(survey.chargerStatus || survey.operatingAgency) && (
                          <div className="flex flex-col gap-1.5 mb-2 pb-2 border-b border-gray-200/60">
                            {survey.chargerStatus && <div className="text-xs"><span className="font-bold text-gray-600">상태:</span> {survey.chargerStatus}</div>}
                            {survey.operatingAgency && <div className="text-xs"><span className="font-bold text-gray-600">기관:</span> {survey.operatingAgency}</div>}
                          </div>
                        )}
                        {survey.chargerType && <div className="text-[11px] text-gray-600"><span className="font-semibold text-gray-500">타입:</span> {survey.chargerType}</div>}
                        {survey.chargerCapacity && <div className="text-[11px] text-gray-600"><span className="font-semibold text-gray-500">용량:</span> {survey.chargerCapacity}</div>}
                        {survey.detailLocation && <div className="text-[11px] text-gray-600 break-words whitespace-normal"><span className="font-semibold text-gray-500">위치:</span> {survey.detailLocation}</div>}
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <div className="flex flex-col">
                          <span className="text-[9px] text-gray-400 font-bold uppercase">담당자</span>
                          <span className="text-sm font-bold text-gray-700">{survey.surveyor}</span>
                        </div>
                        
                        {!isCompleted ? (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleComplete(survey.id);
                            }}
                            className="bg-gray-900 hover:bg-black text-white text-xs px-4 py-2.5 rounded-lg font-bold transition-all shadow-sm active:scale-95"
                          >
                            완료 처리
                          </button>
                        ) : (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReset(survey.id);
                            }}
                            className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs px-4 py-2.5 rounded-lg font-bold transition-all active:scale-95"
                          >
                            완료 취소
                          </button>
                        )}
                      </div>
                    </div>
                  </CustomOverlayMap>
                )}
              </React.Fragment>
            );
          })}
        </Map>
        
        <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md p-5 rounded-2xl shadow-xl z-[1000] border border-white/50 min-w-[160px]">
          <div className="flex flex-col gap-4">
            <div>
              <h4 className="text-[10px] font-black text-gray-400 mb-3 uppercase tracking-widest">조사자 별 현황</h4>
              <div className="flex flex-col gap-2.5">
                {surveyors.filter(name => name !== 'all').map(name => {
                  const stats = getSurveyorStats(name);
                  const color = getMarkerColor(name);
                  const isSelected = selectedSurveyor === name;
                  return (
                    <div 
                      key={name} 
                      className={`flex justify-between items-center text-sm cursor-pointer hover:bg-gray-50 p-1 -mx-1 rounded-md transition-colors ${isSelected ? 'font-bold' : ''}`}
                      onClick={() => setSelectedSurveyor(isSelected ? 'all' : name)}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: color }}></div>
                        <span className="text-gray-700">{name}</span>
                      </div>
                      <span className="font-mono bg-gray-100 px-2 py-0.5 rounded-md text-xs">
                        <span className="text-gray-900 font-bold">{stats.completed}</span>
                        <span className="text-gray-400 mx-1">/</span>
                        <span className="text-gray-500">{stats.total}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="pt-4 border-t border-gray-100 flex justify-between items-center">
              <span className="text-xs font-bold text-gray-600">총 진행률</span>
              <span className="text-sm font-black text-blue-600">
                {Math.round((surveys.filter(s => s.status === '완료').length / (surveys.length || 1)) * 100)}%
              </span>
            </div>
          </div>
        </div>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-gray-900/90 backdrop-blur-sm text-white px-5 py-2.5 rounded-full shadow-2xl z-[1000] flex items-center gap-2 text-xs font-bold border border-white/10">
          <CheckCircle size={14} className="text-green-400" />
          <span>{filteredSurveys.length}개의 지점 표시 중</span>
        </div>
      </main>
    </div>
  );
}

export default App;
