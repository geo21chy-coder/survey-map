const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

async function inspectSchema() {
    try {
        // Try to get one row to see columns, even if it might be empty
        const { data, error } = await supabase
            .from('surveys')
            .select('*')
            .limit(1);
        
        if (error) {
            console.error('Error fetching data:', error.message);
            
            // Try another way to get columns if possible (though limited for anon key)
            console.log('Trying to fetch table info via RPC or other means...');
        } else if (data && data.length > 0) {
            console.log('Columns found in Supabase:', Object.keys(data[0]));
        } else {
            console.log('Table is empty. Cannot determine columns from data.');
            
            // Fallback: try to insert a dummy row and catch error to see expected columns? 
            // Or just list what we expect.
        }
    } catch (e) {
        console.error('Unexpected error:', e.message);
    }
}

inspectSchema();
