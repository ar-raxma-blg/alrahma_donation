// PostgreSQL-backed Supabase test double. Only used with isolated fixture data.
const allowed = new Set(['admins','donors','donor_profiles','donor_consents','campaign_settings','campaign_totals','campaigns','campaign_stats','transactions','installment_balances','public_donations','broadcast_log','notification_templates','audit_log','pledges','pledge_installments']);
const ident = value => { if (!/^[a-z_]+$/.test(value)) throw new Error('Invalid fixture identifier'); return '"'+value+'"'; };
function fixtureClient(db) {
  return { from(table) {
    if (!allowed.has(table)) throw new Error('Unsupported fixture table: '+table);
    let operation='select', projection='*', payload, options={}, filters=[], order=[], limit, offset=0, single=false, count=false, head=false;
    const q={
      select(fields='*',opts={}) {projection=fields;count=opts.count;head=opts.head;return q;},
      insert(value){operation='insert';payload=value;return q;},
      upsert(value,opts){operation='upsert';payload=value;options=opts||{};return q;},
      update(value){operation='update';payload=value;return q;},
      delete(){operation='delete';return q;},
      eq(k,v){filters.push([k,'=',v]);return q;},
      is(k,v){filters.push([k,'is',v]);return q;},
      gt(k,v){filters.push([k,'>',v]);return q;},
      gte(k,v){filters.push([k,'>=',v]);return q;},
      lt(k,v){filters.push([k,'<',v]);return q;},
      lte(k,v){filters.push([k,'<=',v]);return q;},
      in(k,v){filters.push([k,'in',v]);return q;},
      not(k,op,v){filters.push([k,'not',v]);return q;},
      order(k,opts={}){order.push([k,opts.ascending!==false]);return q;},
      limit(n){limit=n;return q;},range(a,b){offset=a;limit=b-a+1;return q;},
      single(){single=true;return q;},maybeSingle(){single=true;return q;},
      async then(resolve,reject){
        try {
          const args=[];const param=v=>{args.push(v);return '$'+args.length;};
          const where=()=>filters.length?' where '+filters.map(([k,op,v])=>op==='in'?ident(k)+' in ('+v.map(param).join(',')+')':op==='is'||op==='not'?ident(k)+(op==='not'?' is not null':' is null'):ident(k)+' '+op+' '+param(v)).join(' and '):'';
          let sql;
          if(operation==='insert'||operation==='upsert'){
            const values=Array.isArray(payload)?payload:[payload];const keys=Object.keys(values[0]);
            sql='insert into '+ident(table)+' ('+keys.map(ident).join(',')+') values '+values.map(row=>'('+keys.map(k=>param(row[k])).join(',')+')').join(',');
            if(operation==='upsert')sql+=' on conflict ('+ident(options.onConflict)+') do nothing';
            sql+=' returning *';
          } else if(operation==='update')sql='update '+ident(table)+' set '+Object.entries(payload).map(([k,v])=>ident(k)+'='+param(v)).join(',')+where()+' returning *';
          else if(operation==='delete')sql='delete from '+ident(table)+where()+' returning *';
          else {
            let source='select * from '+ident(table);
            if(table==='pledges')source='select p.*, (select to_jsonb(c) from campaigns c where c.id=p.campaign_id) campaign, (select to_jsonb(d) from donor_profiles d where d.id=p.donor_id) donor from pledges p';
            if(table==='pledge_installments'||table==='installment_balances')source='select i.*, (select to_jsonb(p) || jsonb_build_object(\'donor\',(select to_jsonb(d) from donor_profiles d where d.id=p.donor_id)) from pledges p where p.id=i.pledge_id) pledge from '+ident(table)+' i';
            if(table==='transactions')source='select t.*, (select to_jsonb(c) from campaigns c where c.id=t.campaign_id) campaign, (select to_jsonb(d) from donor_profiles d where d.id=t.donor_id) donor from transactions t';
            sql='select * from ('+source+') fixture'+where();
            if(order.length)sql+=' order by '+order.map(([k,asc])=>ident(k)+(asc?' asc':' desc')).join(',');
            if(limit!==undefined)sql+=' limit '+Number(limit)+' offset '+Number(offset);
          }
          const rows=operation==='select' ? (await db.query('select to_jsonb(result) record from ('+sql+') result',args)).rows.map(r=>r.record) : (await db.query(sql,args)).rows;
          const result=projection==='*'||projection.includes('(')?rows:rows.map(row=>Object.fromEntries(projection.split(',').map(key=>key.trim()).map(key=>[key,row[key]])));
          resolve({data:head?null:single?(result[0]??null):result,error:null,count:count?rows.length:null});
        } catch(error){resolve({data:null,error:{message:error.message,code:error.code},count:null});}
      }
    };return q;
  }};
}
module.exports={fixtureClient};
