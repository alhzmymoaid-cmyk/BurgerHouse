const CACHE='burger-house-shell-v6';
const SHELL=['/','/brand-mark.svg','/manifest.webmanifest','/manifest-admin.webmanifest','/manifest-staff.webmanifest','/icons/customer-180.png','/icons/customer-192.png','/icons/customer-512.png','/icons/admin-180.png','/icons/admin-192.png','/icons/admin-512.png','/icons/staff-180.png','/icons/staff-192.png','/icons/staff-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('burger-house-shell-')&&key!==CACHE).map(key=>caches.delete(key)))),self.clients.claim()]));});
self.addEventListener('fetch',event=>{const request=event.request;const url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;if(request.mode==='navigate'){event.respondWith(fetch(request).catch(()=>caches.match(request).then(cached=>cached||(url.pathname.startsWith('/staff/')||url.pathname.startsWith('/bh-sovereign-vault')?Response.error():caches.match('/')))));return;}if(['image','style','script','font'].includes(request.destination)){event.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}return response;}).catch(()=>caches.match(request)));}});
self.addEventListener('push',event=>{
  let data={};
  try{data=event.data?event.data.json():{};}catch{data={body:event.data?.text()||''};}
  const title=data.title||'BURGER HOUSE';
  const options={
    body:data.body||'وصل طلب جديد إلى الفرع.',
    icon:'/brand-mark.svg',
    badge:'/brand-mark.svg',
    tag:data.tag||'bh-new-order',
    renotify:true,
    requireInteraction:true,
    vibrate:[250,120,250,120,450],
    data:{url:data.url||'/staff/orders'}
  };
  event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=new URL(event.notification.data?.url||'/staff/orders',self.location.origin).href;
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients=>{
    for(const client of clients){if(client.url===target&&'focus'in client)return client.focus();}
    if(self.clients.openWindow)return self.clients.openWindow(target);
  }));
});
