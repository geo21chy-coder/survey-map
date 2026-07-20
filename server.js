const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const xlsx = require('xlsx');
require('dotenv').config();

// 임시 로컬 캐시: Supabase DB가 다운되었거나 네트워크 에러 시 서버 메모리에 완료 상태 유지
const completedLocalCache = new Set();
// 초기 로딩 속도 극대화를 위한 전역 메모리 캐시
let globalCachedData = null;
let excelLastModified = 0; // 엑셀 파일 수정 시간 추적용

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;
const CACHE_FILE = 'coordinates_cache.json';
const COMPLETED_CACHE_FILE = 'completed_cache.json';

// 완료 상태 로컬 파일 로드
if (fs.existsSync(COMPLETED_CACHE_FILE)) {
    try {
        const fileData = JSON.parse(fs.readFileSync(COMPLETED_CACHE_FILE, 'utf-8'));
        if (Array.isArray(fileData)) {
            fileData.forEach(id => completedLocalCache.add(id));
        }
    } catch (e) {
        console.error("Error loading completed cache:", e);
    }
}

function saveCompletedCache() {
    try {
        fs.writeFileSync(COMPLETED_CACHE_FILE, JSON.stringify(Array.from(completedLocalCache)), 'utf-8');
    } catch (e) {
        console.error("Error saving completed cache:", e);
    }
}

// Startup Environment Check
console.log('--- 시스템 시작 환경 체크 ---');
console.log('PORT:', PORT);
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '설정됨' : '미설정 (확인 필요)');
console.log('KAKAO_REST_API_KEY:', process.env.KAKAO_REST_API_KEY ? '설정됨' : '미설정 (확인 필요)');
console.log('VWORLD_API_KEY:', process.env.VWORLD_API_KEY ? '설정됨' : '미설정 (확인 필요)');
console.log('---------------------------');

// Initialize Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.SUPABASE_KEY || 'placeholder'
);

// Health check endpoint for Render
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        env: {
            hasSupabase: !!process.env.SUPABASE_URL,
            hasKakao: !!process.env.KAKAO_REST_API_KEY,
            hasVworld: !!process.env.VWORLD_API_KEY
        }
    });
});

// Supabase 및 Render 자동 휴면 방지(Keep-Alive) 엔드포인트
app.get('/api/keepalive', async (req, res) => {
    try {
        // Supabase에 아주 가벼운 쿼리를 날려 활동(Activity)을 발생시킴
        const { data, error } = await supabase.from('surveys').select('연번').limit(1);
        res.json({
            status: 'awake',
            time: new Date().toISOString(),
            supabase_ping: error ? 'error' : 'success'
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Load or initialize coordinate cache
let coordCache = {};
if (fs.existsSync(CACHE_FILE)) {
    try {
        coordCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    } catch (e) {
        console.error("Error loading cache:", e);
    }
}

function saveCache() {
    try {
        fs.writeFileSync(CACHE_FILE, JSON.stringify(coordCache, null, 2), 'utf-8');
    } catch (e) {
        console.error("Error saving cache:", e);
    }
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function getCoordinates(address) {
    if (!address) return null;
    if (coordCache[address]) return coordCache[address];

    try {
        await delay(50); // Rate limit protection
        const response = await axios.get('https://dapi.kakao.com/v2/local/search/address.json', {
            params: { query: address },
            headers: { Authorization: `KakaoAK ${KAKAO_KEY}` }
        });

        if (response.data.documents && response.data.documents.length > 0) {
            const { x, y } = response.data.documents[0];
            const coords = { lat: parseFloat(y), lng: parseFloat(x) };
            coordCache[address] = coords;
            return coords;
        }
    } catch (e) {
        console.error(`Error geocoding ${address}:`, e.message);
    }
    return null;
}

app.get('/api/config', (req, res) => {
    res.json({
        vworldKey: process.env.VWORLD_API_KEY
    });
});

app.get('/api/surveys', async (req, res) => {
    // 강력한 브라우저 캐시 방지 헤더 추가
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');

    try {
        let data = [];
        const fileNamesToTry = ['조사1.xlsx', 'survey_data_v2.xlsx', '조사.xlsx'];
        let excelFileFound = false;
        let targetFilePath = null;
        let targetFileStats = null;

        for (const fname of fileNamesToTry) {
            const filePath = path.join(__dirname, fname);
            if (fs.existsSync(filePath)) {
                targetFilePath = filePath;
                targetFileStats = fs.statSync(filePath);
                break;
            }
        }

        // 캐시 무효화 검사
        if (targetFileStats && globalCachedData && excelLastModified === targetFileStats.mtimeMs) {
            // 파일이 변경되지 않았고 메모리에 캐시된 데이터가 있다면 즉시 응답 (속도 대폭 향상)
            return res.json(globalCachedData);
        }

        if (targetFilePath) {
            console.log(`Excel file found: ${targetFilePath}. Parsing...`);
            try {
                const workbook = xlsx.readFile(targetFilePath);
                const sheetName = workbook.SheetNames[0];
                const rawData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
                    
                    const grouped = {};
                    rawData.forEach(row => {
                        const getVal = (prefixes) => {
                            for (const p of prefixes) {
                                const key = Object.keys(row).find(k => k.toLowerCase().includes(p.toLowerCase()));
                                if (key) return row[key];
                            }
                            return null;
                        };
                        const address = (row['지번주소'] || row['도로명주소'] || getVal(['주소', 'address']) || '').toString().trim();
                        if (!address) return;
                        
                        if (!grouped[address]) {
                            grouped[address] = [];
                        }
                        grouped[address].push(row);
                    });
                    
                    let idCounter = 1;
                    for (const [address, rows] of Object.entries(grouped)) {
                        const nameList = [];
                        const chargerStatuses = [];
                        const agencies = [];
                        const chargerTypes = new Set();
                        const chargerCapacities = new Set();
                        const detailLocations = new Set();
                        let firstSurveyor = '';
                        let firstStatus = '';
                        let firstId = 0;
                        
                        rows.forEach(row => {
                            const getVal = (prefixes) => {
                                for (const p of prefixes) {
                                    const key = Object.keys(row).find(k => k.toLowerCase().includes(p.toLowerCase()));
                                    if (key) return row[key];
                                }
                                return null;
                            };
                            
                            const bVal = (row['시설명'] || row['명칭'] || getVal(['시설', 'name']) || '').toString().trim();
                            const hVal = (row['통합본'] || '').toString().trim();
                            if (bVal) {
                                // H열(통합본) 값이 존재하면, B열 내용에 포함되어 있더라도 무조건 괄호로 추가
                                const combined = hVal && bVal !== hVal ? `${bVal}\n(${hVal})` : bVal;
                                if (!nameList.includes(combined)) nameList.push(combined);
                            }
                            
                            const jVal = (row['충전기상태'] || '').toString().trim();
                            if (jVal) chargerStatuses.push(jVal);
                            
                            const iVal = (row['운영기관'] || '').toString().trim();
                            if (iVal) agencies.push(iVal);
                            
                            const lVal = (row['충전기타입'] || '').toString().trim();
                            if (lVal) chargerTypes.add(lVal);
                            
                            const mVal = (row['충전용량'] || '').toString().trim();
                            if (mVal) chargerCapacities.add(mVal);
                            
                            const nVal = (row['상세위치'] || '').toString().trim();
                            if (nVal) detailLocations.add(nVal);
                            
                            if (!firstSurveyor) firstSurveyor = (row['조사자'] || row['조사자5'] || getVal(['조사', 'surveyor']) || '').toString().trim();
                            if (!firstStatus) firstStatus = (row['실태조사 완료여부'] || row['완료여부'] || getVal(['완료', 'status']) || '').toString().trim();
                            if (!firstId) firstId = row['연번'] || row['id'] || row['ID'] || 0;
                        });
                        
                        // 이미 ':' 가 포함된 문자열(그룹화된 텍스트)이면 카운트하지 않고 그대로 합침
                        const countOccurrences = (arr) => {
                            if (arr.length > 0 && arr[0].includes(':')) {
                                return arr.join(', '); // 이미 카운트 된 문자열
                            }
                            const counts = {};
                            arr.forEach(x => { counts[x] = (counts[x] || 0) + 1; });
                            return Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(', ');
                        };
                        
                        data.push({
                            id: firstId || idCounter++,
                            status: firstStatus || '대기',
                            name: nameList.length > 0 ? nameList[0] : '알 수 없음',
                            address: address,
                            surveyor: firstSurveyor || '미지정',
                            chargerStatus: countOccurrences(chargerStatuses),
                            operatingAgency: countOccurrences(agencies),
                            chargerType: Array.from(chargerTypes).join(', '),
                            chargerCapacity: Array.from(chargerCapacities).join(', '),
                            detailLocation: Array.from(detailLocations).join(', ')
                        });
                    }
                excelLastModified = targetFileStats.mtimeMs;
                excelFileFound = true;
            } catch (err) {
                console.error("Excel parsing error:", err);
                return res.status(500).json({ error: "Excel parsing failed", details: err.message, stack: err.stack, file: targetFilePath });
            }
        }

        if (!excelFileFound) {
            return res.status(500).json({ error: "No excel file found. Tried: " + fileNamesToTry.join(', ') });
        }
        /* Fallback logic disabled for debugging
            let { data: sbData, error } = await supabase
                .from('surveys')
                .select('*')
                .order('연번', { ascending: true });

            if (error || !sbData || sbData.length === 0) {
                console.log("Supabase empty or error, falling back to local survey_data.json");
                if (fs.existsSync('survey_data.json')) {
                    const localData = JSON.parse(fs.readFileSync('survey_data.json', 'utf-8'));
                    sbData = localData.data || localData;
                } else {
                    sbData = [];
                }
            }
            
            data = sbData.map(row => {
                const getVal = (prefixes) => {
                    for (const p of prefixes) {
                        const key = Object.keys(row).find(k => k.toLowerCase().includes(p.toLowerCase()));
                        if (key) return row[key];
                    }
                    return null;
                };

                const address = row['지번주소'] || row['도로명주소'] || getVal(['주소', 'address']);
                return {
                    id: row['연번'] || row['id'] || row['ID'] || 0,
                    status: row['실태조사 완료여부'] || row['완료여부'] || getVal(['완료', 'status']) || '대기',
                    name: row['시설명'] || row['명칭'] || getVal(['시설', 'name']) || '알 수 없음',
                    address: address || '주소 없음',
                    surveyor: row['조사자'] || row['조사자5'] || getVal(['조사', 'surveyor']) || '미지정'
                };
            });
        */

        if (data && data.length > 0) {
            console.log(`Processing ${data.length} surveys...`);
            
            // DB에서 '완료' 처리된 목록을 가져와 엑셀 데이터에 병합(Merge)
            try {
                if (supabase) {
                    const { data: sbData, error } = await supabase
                        .from('surveys')
                        .select('연번, 실태조사 완료여부')
                        .eq('실태조사 완료여부', '완료');
                    
                    if (!error && sbData && sbData.length > 0) {
                        const completedIds = new Set(sbData.map(r => r['연번']));
                        data.forEach(item => {
                            if (completedIds.has(item.id)) {
                                completedLocalCache.add(item.id); // DB 정보를 로컬 캐시에 백업
                                item.status = '완료';
                            }
                        });
                        console.log(`Merged ${completedIds.size} completed status from database.`);
                        saveCompletedCache(); // Save merged cache to file
                    }
                }
            } catch (dbErr) {
                console.error("Supabase merge error:", dbErr.message);
            }
            
            // 2차 백업 머지: DB 접속 실패/무시 상황을 대비해 로컬 캐시(메모리)에 있는 완료 상태 강제 덮어쓰기
            if (completedLocalCache.size > 0) {
                data.forEach(item => {
                    if (completedLocalCache.has(item.id)) {
                        item.status = '완료';
                    }
                });
                console.log(`Merged ${completedLocalCache.size} completed status from local fallback cache.`);
            }
        }

        const surveysWithCoords = [];
        let cacheUpdated = false;
        
        for (const item of data) {
            const beforeCacheSize = Object.keys(coordCache).length;
            const coords = await getCoordinates(item.address);
            if (Object.keys(coordCache).length > beforeCacheSize) {
                cacheUpdated = true;
            }
            surveysWithCoords.push({
                ...item,
                lat: coords ? coords.lat : null,
                lng: coords ? coords.lng : null
            });
        }
        
        if (cacheUpdated) {
            saveCache();
        }

        const validCoordsCount = surveysWithCoords.filter(s => s.lat).length;
        console.log(`Loaded ${surveysWithCoords.length} surveys. Valid coords: ${validCoordsCount}`);
        
        // 완성된 데이터를 전역 변수에 저장하여 다음 요청부터는 0.01초만에 응답하도록 처리
        globalCachedData = surveysWithCoords;

        res.json(surveysWithCoords);
    } catch (e) {
        console.error("Fetch error:", e.message);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/surveys/:id/complete', async (req, res) => {
    const id = parseInt(req.params.id);
    const today = new Date().toISOString().split('T')[0];
    
    try {
        // 1. 메모리 캐시에 즉각 저장 (DB가 죽어도 새로고침 시 유지되도록)
        completedLocalCache.add(id);
        saveCompletedCache();

        // 1-1. 전역 응답 캐시(초기 로딩 속도 최적화용)에도 상태를 즉각 반영
        if (globalCachedData) {
            const cachedItem = globalCachedData.find(s => s.id === id);
            if (cachedItem) cachedItem.status = '완료';
        }

        // 2. Update status in Supabase table (에러 발생 시에도 프론트엔드 UI 업데이트를 위해 무시)
        try {
            const { data, error } = await supabase
                .from('surveys')
                .update({ 
                    '실태조사 완료여부': '완료',
                    '조사일자': today 
                })
                .eq('연번', id); 
            if (error) {
                console.error("Supabase update error:", error.message || error);
            }
        } catch (dbErr) {
            console.log("Supabase update failed but ignored for UI:", dbErr.message);
        }

        console.log(`Successfully processed ID ${id}.`);
        res.json({ success: true, id, status: '완료' });
    } catch (e) {
        console.error("Update error:", e.message);
        res.json({ success: true, id, status: '완료', warning: e.message }); // 강제 성공 반환
    }
});

app.post('/api/surveys/:id/reset', async (req, res) => {
    const id = parseInt(req.params.id);
    
    try {
        // 1. 메모리 캐시에서 ID 삭제 (새로고침 시 대기 상태로 읽히도록)
        completedLocalCache.delete(id);
        saveCompletedCache();

        // 1-1. 전역 응답 캐시에도 상태를 '대기'로 즉각 복구
        if (globalCachedData) {
            const cachedItem = globalCachedData.find(s => s.id === id);
            if (cachedItem) cachedItem.status = '대기';
        }

        // 2. Update status in Supabase table (DB가 살아있다면 DB도 대기로 되돌림)
        try {
            const { data, error } = await supabase
                .from('surveys')
                .update({ 
                    '실태조사 완료여부': '대기',
                    '조사일자': null 
                })
                .eq('연번', id); 
            if (error) {
                console.error("Supabase reset error:", error.message || error);
            }
        } catch (dbErr) {
            console.log("Supabase reset failed but ignored for UI:", dbErr.message);
        }

        console.log(`Successfully reset ID ${id} to 대기.`);
        res.json({ success: true, id, status: '대기' });
    } catch (e) {
        console.error("Reset error:", e.message);
        res.json({ success: true, id, status: '대기', warning: e.message }); // 강제 성공 반환
    }
});

// Serve frontend build in production
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
        if (!req.path.startsWith('/api')) {
            res.sendFile(path.join(distPath, 'index.html'));
        }
    });
}

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} with Supabase integration.`);
});
