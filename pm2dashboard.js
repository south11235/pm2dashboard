var http = require('http');
var path = require('path');
var Q = require('q');
var ArgumentParser = require('argparse').ArgumentParser;
var request = require('request');
var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io').listen(server);
    io.set('log level', 1);
var storage = require('node-persist');
var routes = require('./lib/server/routes');

var parser = new ArgumentParser({
  version: '0.1.0',
  addHelp:true,
  description: 'PM2 UI Panel'
});
parser.addArgument(
  ['-p', '--port'],
  {
    help: 'PM2Dashboard HTTP listen port',
    defaultValue: 3000
  }
);
parser.addArgument(
  ['-i', '--interval'],
  {
    help: 'Interval to poll pm2 instances in milliseconds',
    defaultValue: 5000
  }
);
parser.addArgument(
  ['-s', '--storage'],
  {
    /*
      node-persist defaults into ./node_modules/node-persist/persist/
      defaultValue here moves storage into a more sane location
    */
    help: 'Directory path to settings storage location.',
    defaultValue: '../../../data'
  }
);
var args = parser.parseArgs();


// all environments
app.set('port', process.env.PM2DASHBOARD_PORT || args.port);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
//app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(app.router);
app.use('/public/', express.static('lib/server/public'))
// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

storage.initSync({
  continuous: true,
  encoding: 'utf8',
  logging: true,
  dir: args.storage  
});

var pm2d = {};
pm2d.updateInterval = undefined;
pm2d.servers = storage.getItem('servers') || {};
pm2d.getServerStatus = function(name, url, port) {
  var defer = Q.defer();
  console.log('updating', name, url, port);
  request(url + ':' + port, function(err, resp, body){
    if (!err && resp.statusCode === 200 ) {
      defer.resolve({'name': name, 'id': url, 'stats': JSON.parse(body)});
    } else {
      defer.reject(err);
    }
  });
  return defer.promise; 
};

io.sockets.on('connection', function(socket){

  socket.on('server:store', function(data){
    if (data.url && data.port) {
      //check that we can successfully get host data once before storing
      pm2d.getServerStatus(data.name, data.url, data.port)
      .then(function(){
        //provide a prettier name for display and storage
        var storageName = data.name;
        console.log('creating storage entry for', storageName);
        pm2d.servers[storageName] = {url: data.url, port: data.port};
        storage.setItem('servers', pm2d.servers);
        socket.emit('announce', {host:'added', success: 'New Host ' + data.url + ':' + data.port + ' Added'});
        socket.broadcast.emit('announce', {host:'added', success: 'New Host ' + data.url + ':' + data.port + ' Added'});

      })
      .catch(function(err){
        socket.emit('announce', {error: 'failed adding ' + data.url + ':' + data.port + '  ' + err});
        console.error('error adding new host', err);

      })
      .done();
    } else {
      socket.emit('announce', {error: 'malformed server store request'});
      console.error('malformed server store request', data);
    }
  });

  socket.on('server:delete', function(data){
    if (pm2d.servers[data]){
      delete pm2d.servers[data];
      storage.setItem('servers', pm2d.servers);
      socket.emit('announce', {host:'deleted', success: 'Host ' + data + ' was removed'});
      socket.broadcast.emit('announce', {host:'deleted', success: 'Host ' + data + ' was removed'});
    } else {
      socket.emit('announce', {'error':'no server found for: ' + data});
    }
  });

  socket.on('serverList:update', function(data){
    console.log('list update:', data);
    socket.emit('server:list', JSON.stringify(storage.getItem('servers')));
  })
  socket.on('interval:store', function(data){
    console.log('setting interval', data);
  });

  // cycle through host list on an interval and send clients stats
  if (!pm2d.updateInterval) {
    pm2d.updateInterval = setInterval(function(){
      if (socket && pm2d.servers) {
        for ( s in pm2d.servers) {
          pm2d.getServerStatus(s, pm2d.servers[s].url, pm2d.servers[s].port)
          .then(function(res){
              socket.broadcast.emit('systemStats', res);
            })
          .catch(function(err){
              console.log(err);
              socket.emit('announce', {'error': 'error contacting host - ' + pm2d.servers[s].url + ':' + pm2d.servers[s].port});
            })
          .done();
        }
      }
    },args.interval);
  }
});

app.get('/', routes.index);
server.listen( app.get('port') );
