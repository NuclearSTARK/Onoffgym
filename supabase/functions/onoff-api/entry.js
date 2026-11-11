import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {createHandler} from './server.js';
const db=createClient(Deno.env.get('SUPABASE_URL'),Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(createHandler(db,{reauthenticate:async(email,password)=>{const client=createClient(Deno.env.get('SUPABASE_URL'),Deno.env.get('SUPABASE_ANON_KEY')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});const {data,error}=await client.auth.signInWithPassword({email,password});return error?null:{user:data.user,accessToken:data.session?.access_token};},verifyUser:async token=>{const {data,error}=await db.auth.getUser(token);return error?null:data.user;}}));
