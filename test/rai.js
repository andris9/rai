var RAIServer = require("../lib/rai").RAIServer,
    testCase = require('nodeunit').testCase,
    utillib = require("util"),
    netlib = require("net"),
    crypto = require("crypto"),
    tlslib = require("tls");

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
    "Receive Command with payload":  function(test){
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
    },
    "Send data to client":  function(test){
        var server = new RAIServer();
        server.listen(PORT_NUMBER, function(err){
            
            server.on("connection", function(socket){
                
                socket.send("HELLO");

                socket.on("end", function(){
                    server.end(function(){
                        test.done();
                    });
                });
            });
            
            var client = netlib.connect(PORT_NUMBER, function(){
                client.on("data", function(chunk){
                    test.equal(chunk.toString(), "HELLO\r\n");
                    client.end();
                });
            });

        });
    },
    "DATA mode": function(test){
        var server = new RAIServer(),
            datapayload = "tere\r\nvana kere";
        server.listen(PORT_NUMBER, function(err){
            
            server.on("connection", function(socket){
                
                socket.startDataMode();

                test.expect(2);

                socket.on("data", function(chunk){
                    test.equal(datapayload, chunk.toString());
                });
                
                socket.on("ready", function(){
                    test.ok(1,"Data ready");
                    server.end(function(){
                        test.done();
                    });
                });
                
            });
            
            var client = netlib.connect(PORT_NUMBER, function(){
                client.write(datapayload+"\r\n.\r\n");
                client.end();
            });

        });
    },
    "STARTTLS":  function(test){
        var server = new RAIServer();
        server.listen(PORT_NUMBER, function(err){
            
            test.expect(2);
            
            server.on("connection", function(socket){
                
                socket.startTLS();
                socket.on("tls", function(){
                    test.ok(1, "Secure connection opened");
                    socket.send("TEST");
                });
                
                socket.on("end", function(){
                    server.end(function(){
                        test.done();
                    });
                });
            });
            
            var client = netlib.connect(PORT_NUMBER, function(){
                var sslcontext = crypto.createCredentials();
                var pair = tlslib.createSecurePair(sslcontext, false);
                
                pair.encrypted.pipe(client);
                client.pipe(pair.encrypted);
                pair.fd = client.fd;
                
                pair.on("secure", function(){
                    pair.cleartext.on("data", function(chunk){
                        test.equal(chunk.toString(), "TEST\r\n");
                        pair.cleartext.end();
                    });
                });
            });

        });
    } 
}