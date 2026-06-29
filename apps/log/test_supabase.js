const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://fmxddvjgkykuqwmasigo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZteGRkdmpna3lrdXF3bWFzaWdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwNDMzMjcsImV4cCI6MjA1OTYxOTMyN30.XCU4-03oajGh6M2-PNiBotCZSIDn_nJXkIC0Thjjfqo';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function test() {
    console.log('Fetching logs...');
    const { data, error } = await supabase.from('logs').select('*').limit(5);
    if (error) {
        console.error('Error fetching logs:', error);
    } else {
        console.log('Logs fetched successfully:', data);
    }

    console.log('Subscribing to realtime...');
    const channel = supabase.channel('schema-db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'logs' }, payload => {
            console.log('Change received!', payload);
        })
        .subscribe((status) => {
            console.log('Subscription status:', status);
        });

    // Keep running for 10 seconds to see if anything fires, then close
    setTimeout(() => {
        console.log('Closing channel...');
        supabase.removeChannel(channel);
        process.exit(0);
    }, 10000);
}

test();
