$(function(){  
  pm2d.init() 
});

var pm2d = (function(){
  return {
    servers: {},
    init: function(){
      console.log('PM2D: initialize');
      pm2d.setupEvents();
      pm2d.setupTemplates();
      pm2d.setupSocket();
    },

    setupEvents: function(){
      console.log('PM2D: configuring event router');
      pm2d.events = {};
      _.extend(pm2d.events, Backbone.Events);
    },
    setupTemplates: function(){
      console.log('PM2D: compiling templates');
      pm2d.templates = {};
      var availableTemplates = $('script[type="text/x-handlebars-template"]');
      for (var t = 0; t < availableTemplates.length; t++){
        pm2d.templates[ availableTemplates[t].id ] = Handlebars.compile( $(availableTemplates[t]).html() );
      }
    },

    setupSocket: function(){
      console.log('PM2D: connecting and configuring socket');
      pm2d.socket = window.SOCKET = io.connect('/');
      pm2d.socket.on( 'connect'       , function(){     pm2d.events.trigger('socket:connected' )});
      pm2d.socket.on( 'disconnect'    , function(){     pm2d.events.trigger('socket:disconnected' )});
      pm2d.socket.on( 'announce'      , function(msg){  pm2d.events.trigger('announce', msg)});
      pm2d.socket.on( 'systemStats'   , function(data){ pm2d.events.trigger('systemStats:receive', data)});
      pm2d.socket.on( 'server:list'   , function(data){ pm2d.events.trigger('serverList:receive', data)});
    },

    renderTabs: function(){
      $('#tabList').empty();
      for (s in pm2d.servers) {
        $('#tabList').append( pm2d.templates.renderTabList({id: s, hostname: pm2d.normalizeName( pm2d.servers[s].url ) }) );
      }
      $('#tabList').append( pm2d.templates.renderNewServer() );

      $('#tabList').each(function(){
        var $active, $content, $links = $(this).find('a');
        $active = $($links.filter('[href="'+location.hash+'"]')[0] || $links[0]);
        $active.parent().addClass('active');
        $content = $($active.attr('href'));
        if ( !$content.is(':visible')  ) {
          $content.show();
        }

        $links.not($active).each(function(){
          $($(this).attr('href')).hide();
        });
      });
  
      //Tab Events
      //Select/Change tabs
      $('#tabList a.tabSelect').on('click', function(e){
        var selectedTab = $(e.currentTarget);
        var activeTab = $('#tabList li.active');
        if (selectedTab.attr('href') !== activeTab.find('a.tabSelect').attr('href')){
          $(selectedTab.attr('href')).show();
          $(activeTab.find('a.tabSelect').attr('href')).hide();
          activeTab.removeClass('active');
          selectedTab.parent().addClass('active');

        }
      });

      //Delete Host
      $('#tabList a .icon-remove-sign').on('click', function(e){
        e.preventDefault();
        var deleteHost = $(e.currentTarget).attr('data-remove');
        if (deleteHost && window.confirm("delete " + deleteHost + " ?")) {
          $('#host-' + pm2d.normalizeName( deleteHost) ).remove();
          pm2d.socket.emit('server:delete', deleteHost);
          pm2d.socket.emit('serverList:update');

        }
      });
      //Add Host
      $('#host-newHost button#newHostSubmit').off('click');
      $('#host-newHost button#newHostSubmit').on('click', function(e){
        var name = $('#newHost input[name="name"]').val();
        var url = $('#newHost input[name="url"]').val();
        var port = $('#newHost input[name="port"]').val();
        if (url && url !== "" && port && port !== "") {
          console.log('sending store');
          var serverName = name !== "" ? name : url ; 
          console.log('new server', serverName, url, port);
          pm2d.socket.emit('server:store', {name: serverName, url: url, port: port});
          pm2d.socket.emit('serverList:update');
          window.location.hash = 'host-' + url.substr( url.indexOf('://') + 3 ).replace(/\./g, '-');
        } else {
          console.error('form incomplete')
        }
        e.preventDefault()
      });
      
    },

    enrichStats: function(systemStats){
      // do additional logic work on pm2 stats json structure to keep logic out of templates
      var updatedStats = systemStats.stats;

      //host info
      updatedStats.system_info.name = systemStats.name;
      updatedStats.system_info.id = pm2d.normalizeName( systemStats.id );
      updatedStats.system_info.uptime_text = moment().subtract( updatedStats.system_info.uptime * 1000).fromNow();

      //system memory
      updatedStats.monit.total_mem_text = pm2d.bytesToSize( updatedStats.monit.total_mem, 2);
      updatedStats.monit.free_mem_text = pm2d.bytesToSize( updatedStats.monit.total_mem - updatedStats.monit.free_mem, 2);
      updatedStats.monit.used_percentage = Math.round( ( ( updatedStats.monit.total_mem - updatedStats.monit.free_mem ) / updatedStats.monit.total_mem) * 100 );
      
      //process stats
      for (p in updatedStats.processes) {
        var process = updatedStats.processes[p]
        process.started = moment( process.pm_uptime ).fromNow();
        process.mem_text = pm2d.bytesToSize( process.monit.memory, 2);
        process.unstable_restarts = updatedStats.processes[p].pm2_env.restart_time;
        process.status_text = updatedStats.processes[p].pm2_env.status === 'online' ? 'online' : 'error';
      }
      window.blah = updatedStats;
      return updatedStats;

    },

    renderProcessTable: function(systemStats){
      $('#systems #host-' + systemStats.system_info.id + ' table tbody').empty();
      for (p in systemStats.processes) {
        var process = systemStats.processes[p];
        $('#systems #host-' + systemStats.system_info.id + ' table tbody').append( pm2d.templates.processListItem( process ) );
      }
    },
  
    renderHostInfo: function(systemStats){
      $('#systems #host-' + systemStats.system_info.id + ' .hostInfo').empty();
      $('#systems #host-' + systemStats.system_info.id + ' .hostInfo').append( pm2d.templates.hostInfoItem( systemStats ));
    },
  
    renderLoadInfo: function(systemStats){
      $('#systems #host-' + systemStats.system_info.id + ' .loadavg').empty();
      $('#systems #host-' + systemStats.system_info.id + ' .loadavg').append( pm2d.templates.hostLoadItem( systemStats ));
    },
  
    renderMemoryInfo: function(systemStats){
      $('#systems #host-' + systemStats.system_info.id + ' .meminfo').empty();
      $('#systems #host-' + systemStats.system_info.id + ' .meminfo').append( pm2d.templates.memoryInfoItem( systemStats ));
    },
  
    bytesToSize: function(bytes, precision) {
      var sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
      var posttxt = 0;
      if (bytes == 0) return 'n/a';
      while( bytes >= 1024 ) {
          posttxt++;
          bytes = bytes / 1024;
      }
      return parseFloat(bytes).toFixed(precision) + " " + sizes[posttxt];
    },

    normalizeName: function( name ){
      var normalName = name.replace(/\./g, '-');
      if (normalName.indexOf('://') > -1 ) {
        normalName = normalName.substr( normalName.indexOf('://') + 3 );
      }
      return normalName;
    }
  
  }
  
})();







