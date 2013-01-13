var express = require('express')
  , http = require('http')
  , path = require('path')
  , stylus = require('stylus')
  , nib = require('nib')
  , _ = require('underscore')
  , app = express()
  , server = http.createServer(app)
  , io = require('socket.io').listen(server)

app.configure(function(){
  app.set('port', process.env.PORT || 4000);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);

  var compile = function(str, path) {
    return stylus(str)
      .set('filename', path)
      .set('compress', false)
      .use(nib());
  }
  
  app.use(stylus.middleware({
      src: __dirname + '/static'
    , compile: compile
  }))

  app.use(express.static(path.join(__dirname, 'static')));
});

app.configure('development', function(){
  app.use(express.errorHandler());
});

app.get('/', function(req, res){
  res.render('index', { title: 'Express' });
});

server.listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});

var clients = []
  , admins = []
  , CLIENT_TIMEOUT = 3000

function findClient(id) {
  return _.find(clients, function(client) {return client.state.id === id})
}

function trackedPageConnection(socket, initialData) {
  var id

  if(initialData.cookie != null) {
    id = initialData.cookie
    socket.emit('startupdate', {})
  } else {
    id = _.uniqueId()
    socket.emit('startupdate', {cookie: id})
  }

  socket.on('update', function(data) {
    var client = findClient(id) // TODO: error handling
    if(client) {
      clearTimeout(client.timer)
      client.timer = null
      _.extend(client.state, data)
      // Update case
      admins.forEach(function(admin) {admin.clientUpdated(client)})
    } else {
      data.id = id
      client = {state: data}
      clients.push(client)
      // New client case
      admins.forEach(function(admin) {admin.clientConnected(client)})
    }
    console.log("clients: ", clients)
  })

  socket.on('disconnect', function() {
    var client = findClient(id)
    if(client && !client.timer) {
      client.timer = setTimeout(function() {
        clients.splice(clients.indexOf(client), 1)
        // Close case
        admins.forEach(function(admin) {admin.clientDisconnected(id)})
      }, CLIENT_TIMEOUT)
    }
  })
}

function AdminConnection(socket, initialData) {
  this.socket = socket
  clients.forEach(function(client) {
    socket.emit('client-connected', client.state)
  })

  socket.on('disconnect', function() {
    admins.splice(admins.indexOf(this), 1)
  })
}

AdminConnection.prototype.clientConnected = function(client) {
    this.socket.emit('client-connected', client.state)
}

AdminConnection.prototype.clientUpdated = function(client) {
    this.socket.emit('client-updated', client.state)
}

AdminConnection.prototype.clientDisconnected = function(id) {
    this.socket.emit('client-disconnected', {id: id})
}

io.sockets.on('connection', function (socket) {
  socket.on('tracked-start', function(data) {trackedPageConnection(socket, data)})
  socket.on('admin-start', function(data) {
    admins.push(new AdminConnection(socket, data))
  })
})
