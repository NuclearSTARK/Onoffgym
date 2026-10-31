import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {createHandler} from './server.js';
const db=createClient(Deno.env.get('SUPABASE_URL'),Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(createHandler(db,{verifyUser:async token=>{const {data,error}=await db.auth.getUser(token);return error?null:data.user;}}));
