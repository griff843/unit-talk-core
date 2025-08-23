#!/usr/bin/env tsx
import '../shared/bootstrapEnv';
import { getSupabaseAdmin } from '../shared/db';

async function main() {
  try {
    const supabase = getSupabaseAdmin();
    
    console.log('🔧 Checking allowed prop_category values...');
    
    // Get distinct prop_category values
    const { data, error } = await supabase
      .from('raw_props')
      .select('prop_category')
      .not('prop_category', 'is', null)
      .limit(20);
      
    if (error) {
      console.log('❌ Error:', error.message);
    } else {
      const categories = [...new Set(data?.map(d => d.prop_category))].sort();
      console.log('✅ Allowed prop_category values:', categories);
    }
    
    // Check some other fields too
    console.log('\n🔧 Checking allowed sport values...');
    const { data: sportsData, error: sportsError } = await supabase
      .from('raw_props')
      .select('sport')
      .not('sport', 'is', null)
      .limit(10);
      
    if (!sportsError && sportsData) {
      const sports = [...new Set(sportsData.map(d => d.sport))].sort();
      console.log('✅ Sport values:', sports.slice(0, 5), '...');
    }
    
  } catch (error) {
    console.error('💥 Failed:', error);
  }
}

main();