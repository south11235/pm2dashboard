//handle messages coming from server socket
$(function(){
  pm2d.events.on('announce', function(msg){
    console.log(JSON.stringify(msg));
    if (msg.error) {
      noty({text: msg.error, type: 'error', timeout: 4000});
    };
    if (msg.success) {
      noty({text: msg.success, type: 'success', timeout: 4000})
    }
    if (msg.info) {
      noty({text: msg.info, type: 'information', timeout: 4000});
    };
    if (msg.host === 'added' || msg.host === 'deleted') {
      pm2d.socket.emit('serverList:update');
    };
  });

	pm2d.events.on('socket:connected', function(msg){
		pm2d.events.trigger('announce', {'info': 'socket connected'});
    $('.icon-globe').removeClass('disconnected').attr('title', '');
    //clean-up any leftover panels from prior disconnects
    $('#systems > div').filter(function(){ if( $(this).attr('id') !== 'host-newHost' ) return this}).remove(); 
    pm2d.socket.emit('serverList:update');
	});

  pm2d.events.on('socket:disconnected', function(msg){
    pm2d.events.trigger('announce', {'info': 'socket disconnected'});
    $('.icon-globe').addClass('disconnected').attr('title', 'socket disconnected');
  });

  pm2d.events.on('serverList:receive', function(msg){
    pm2d.servers = JSON.parse(msg);
    pm2d.renderTabs();
  });

  pm2d.events.on('systemStats:receive', function(msg){
    var enrichedStats = pm2d.enrichStats( msg );
    //render full tab content if it doesn't exist. 
    if ( pm2d.servers[ enrichedStats.system_info.name ] && $('#host-'  + enrichedStats.system_info.id).length === 0 ) {
      $('#systems').append( pm2d.templates.renderSystemStats( enrichedStats ) );
      //new host stats added, update the tabs to show new addition and set panel visibility
      pm2d.renderTabs();
    }
    //update panel contents elements
    pm2d.renderHostInfo(enrichedStats);
    pm2d.renderLoadInfo(enrichedStats);
    pm2d.renderMemoryInfo(enrichedStats);
    pm2d.renderProcessTable(enrichedStats);
  });

});
