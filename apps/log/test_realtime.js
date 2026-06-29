const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://fmxddvjgkykuqwmasigo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZteGRkdmpna3lrdXF3bWFzaWdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwNDMzMjcsImV4cCI6MjA1OTYxOTMyN30.XCU4-03oajGh6M2-PNiBotCZSIDn_nJXkIC0Thjjfqo';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function test() {
    console.log('Subscribing to realtime...');
    let eventReceived = false;

    const channel = supabase.channel('schema-db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'logs' }, payload => {
            console.log('--- CHANGE RECEIVED ---', payload);
            eventReceived = true;
        })
        .subscribe(async (status) => {
            console.log('Subscription status:', status);
            if (status === 'SUBSCRIBED') {
                console.log('Subscribed! Waiting 2s before inserting test log...');
                setTimeout(async () => {
                    console.log('Inserting test log...');
                    const { data, error } = await supabase.from('logs').insert([{ content: 'REALTIME TEST LOG ' + Date.now() }]).select();
                    if (error) {
                        console.error('Insert error:', error);
                    } else {
                        console.log('Inserted log successfully:', data);
                        const insertedId = data[0].id;
                        
                        console.log('Waiting 5 seconds for realtime event...');
                        setTimeout(async () => {
                            if (eventReceived) {
                                console.log('Realtime postgres_changes works! 🎉');
                            } else {
                                console.log('Realtime postgres_changes did NOT trigger. ❌');
                            }
                            console.log('Deleting test log...');
                            await supabase.from('logs').delete().eq('id', insertedId);
                            console.log('Deleted. Exiting.');
                            process.exit(0);
                        }, 5000);
                    }
                }, 2000);
            }
        });
}

test();
