var RAIServer = require("../lib/rai").RAIServer,
    testCase = require('nodeunit').testCase,
    utillib = require("util"),
    netlib = require("net");

var PORT_NUMBER = 8397;

exports["General tests"] = {
    "Create and close a server": function(test){
        var server = new RAIServer();
        server.listen(PORT_NUMBER, function(err){
            test.ifError(err);
            server.end(function(){
                test.ok(1, "Server closed");
                test.done();
            });
        });
    },
    "Duplicate server fails": function(test){
        var server = new RAIServer();
        server.listen(PORT_NUMBER, function(err){
            test.ifError(err);
            
            var duplicate = new RAIServer();
            duplicate.listen(PORT_NUMBER, function(err){
                test.ok(err, "Responds with error")
                server.end(function(){
                    test.ok(1, "Server closed");
                    test.done();
                });
            });
            
        });
    },
    "Connection event": function(test){
        var server = new RAIServer();
        test.expect(3);
        server.listen(PORT_NUMBER, function(err){
            
            server.on("connection", function(socket){
                test.ok(socket, "Client connected");
                
                socket.on("end", function(){
                    test.ok(1, "Connection closed");
                    
                    server.end(function(){
                        test.done();
                    });
                });
            });
            
            var client = netlib.connect(PORT_NUMBER, function(){
                test.ok(1, "Connected to server");
                client.end();
            });

        });
    },
    "Timeout": function(test){
        var server = new RAIServer({timeout: 300});
        test.expect(3);
        server.listen(PORT_NUMBER, function(err){
            
            server.on("connection", function(socket){
                test.ok(socket, "Client connected");
                
                socket.on("timeout", function(){
                    test.ok(1, "Connection closed");
                    
                    server.end(function(){
                        test.done();
                    });
                });
            });
            
            var client = netlib.connect(PORT_NUMBER, function(){
                test.ok(1, "Connected to server");
            });

        });
    },
    "Close client socket":  function(test){
        var server = new RAIServer();
        test.expect(4);
        server.listen(PORT_NUMBER, function(err){
            
            server.on("connection", function(socket){
                test.ok(socket, "Client connected");
                
                socket.on("end", function(){
                    test.ok(1, "Connection closed");
                    
                    server.end(function(){
                        test.done();
                    });
                });
                socket.end();
            });
            
            var client = netlib.connect(PORT_NUMBER, function(){
                test.ok(1, "Connected to server");
            });
            client.on("end", function(){
                test.ok(1, "Connection closed by host");
            })

        });
    },
    "Receive Simple Command":  function(test){
        var server = new RAIServer();
        server.listen(PORT_NUMBER, function(err){
            
            server.on("connection", function(socket){
                
                socket.on("command", function(command, payload){
                    test.equal(command, "STATUS");
                    test.equal(payload.toString(), "");
                    socket.end();
                    server.end(function(){
                        test.done();
                    });
                });
            });
            
            var client = netlib.connect(PORT_NUMBER, function(){
                client.write("STATUS\r\n");
            });

        });
    },
    "Receive Command":  function(test){
        var server = new RAIServer();
        server.listen(PORT_NUMBER, function(err){
            
            server.on("connection", function(socket){
                
                socket.on("command", function(command, payload){
                    test.equal(command, "MAIL");
                    test.equal(payload.toString(), "TO:");
                    socket.end();
                    server.end(function(){
                        test.done();
                    });
                });
            });
            
            var client = netlib.connect(PORT_NUMBER, function(){
                client.write("MAIL TO:\r\n");
            });

        });
    }
}