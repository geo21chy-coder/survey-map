const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

// 1. Supabase 연결 설정
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

async function syncData() {
    try {
        console.log('--- 데이터 동기화 시작 ---');
        
        let localRows = [];
        const xlsxPath = fs.existsSync('조사1.xlsx') ? '조사1.xlsx' : (fs.existsSync('survey_data_v2.xlsx') ? 'survey_data_v2.xlsx' : null);
        
        if (xlsxPath) {
            console.log(`엑셀 파일(${xlsxPath})에서 데이터 파싱 중...`);
            const xlsx = require('xlsx');
            const workbook = xlsx.readFile(xlsxPath);
            const sheetName = workbook.SheetNames[0];
            localRows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
        } else if (fs.existsSync('survey_data.json')) {
            console.log('survey_data.json에서 데이터 읽는 중...');
            const rawData = JSON.parse(fs.readFileSync('survey_data.json', 'utf-8'));
            localRows = rawData.data || rawData;
        }

        if (!localRows || localRows.length === 0) {
            console.log('동기화할 데이터가 없습니다.');
            return;
        }

        console.log(`총 ${localRows.length}개의 엑셀 데이터를 분석 중...`);

        // 기존 DB 데이터 조회 (기존에 완료된 상태 보존용)
        const { data: existingData, error: fetchError } = await supabase
            .from('surveys')
            .select('*');
            
        if (fetchError) {
            console.error('기존 DB 조회 실패:', fetchError.message);
        }
        
        const existingStatusMap = new Map();
        const existingDateMap = new Map();
        if (existingData) {
            existingData.forEach(row => {
                existingStatusMap.set(Number(row['연번']), row['실태조사 완료여부']);
                existingDateMap.set(Number(row['연번']), row['조사일자']);
            });
        }
        
        const rowsToUpload = localRows.map(row => {
            const getVal = (prefixes) => {
                for (const p of prefixes) {
                    const key = Object.keys(row).find(k => k.toLowerCase().includes(p.toLowerCase()));
                    if (key) return row[key];
                }
                return null;
            };

            const id = Number(row['연번'] || row['id'] || row['ID']);
            const existingStatus = existingStatusMap.get(id);
            const existingDate = existingDateMap.get(id);

            return {
                '연번': id,
                '실태조사 완료여부': existingStatus || row['실태조사 완료여부'] || '대기',
                '시설명': row['시설명'] || row['명칭'] || getVal(['시설', 'name']) || '알 수 없음',
                '지번주소': row['지번주소'] || row['도로명주소'] || getVal(['주소', 'address']) || '주소 없음',
                '조사자': row['조사자5'] || row['조사자'] || getVal(['조사', 'surveyor']) || '미지정',
                '조사일자': existingDate || row['조사일자5'] || row['조사일자'] || null
            };
        }).filter(r => Boolean(r['연번']));

        const existingIds = new Set(existingData ? existingData.map(r => Number(r['연번'])) : []);
        
        const newRows = [];
        const updateRows = [];

        rowsToUpload.forEach(row => {
            if (existingIds.has(row['연번'])) {
                updateRows.push(row);
            } else {
                newRows.push(row);
            }
        });

        if (newRows.length > 0) {
            console.log(`새로운 장소 ${newRows.length}개를 DB에 추가합니다...`);
            const { error: insertErr } = await supabase.from('surveys').insert(newRows);
            if (insertErr) {
                console.error('새 데이터 insert 실패:', insertErr.message);
            } else {
                console.log(`새로운 ${newRows.length}개 장소 추가 성공!`);
            }
        }

        if (updateRows.length > 0) {
            console.log(`기존 장소 ${updateRows.length}개의 데이터 업데이트 처리 중...`);
            // 정보 업데이트가 필요한 행들을 묶어서 처리
            for (const row of updateRows) {
                await supabase.from('surveys').update({
                    '시설명': row['시설명'],
                    '지번주소': row['지번주소'],
                    '조사자': row['조사자']
                }).eq('연번', row['연번']);
            }
            console.log(`기존 ${updateRows.length}개 장소 정보 갱신 완료!`);
        }

        console.log('--- 동기화 완료! ---');

    } catch (e) {
        console.error('예기치 못한 오류 발생:', e.message);
    }
}

syncData();

