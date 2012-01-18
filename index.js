/**
 * @fileOverview This is the main file for the RAI library to create text based servers
 * @author <a href="mailto:andris@node.ee">Andris Reinman</a>
 * @version 0.1.0
 */

var netlib = require("net"),
    utillib = require("util"),
    EventEmitter = require('events').EventEmitter,
    starttls = require("./starttls"),
    tlslib = require("tls"),
    crypto = require("crypto"),
    fs = require("fs");

// Default credentials for starting TLS server
var defaultCredentials = {
    key: fs.readFileSync(__dirname+"/cert/key.pem"),
    cert: fs.readFileSync(__dirname+"/cert/cert.pem")
}

// Expose to the world
module.exports.RAIServer = RAIServer;

/**
 * <p>Creates instance of RAIServer</p>
 * 
 * <p>Options object has the following properties:</p>
 * 
 * <ul>
 *   <li><b>debug</b> - if set to true print traffic to console</li>
 *   <li><b>timeout</b> - timeout in milliseconds for disconnecting the client,
 *       defaults to 0 (no timeout)</li>
 * </ul>
 * 
 * <p><b>Events</b></p>
 * 
 * <ul>
 *     <li><b>'connect'</b> - emitted if a client connects to the server, param
 *         is a client ({@link RAISocket}) object</li>
 * </ul> 
 * 
 * @constructor
 * @param {Object} [options] Optional options object
 */
function RAIServer(options){
    EventEmitter.call(this);
    
    this.options = options || {};
    
    this._createServer();
}
utillib.inherits(RAIServer, EventEmitter);

/**
 * <p>Starts listening on selected port</p>
 * 
 * @param {Number} port The port to listen
 * @param {String} [host] The IP address to listen
 * @param {Function} callback The callback function to be run after the server
 * is listening, the only param is an error message if the operation failed 
 */
RAIServer.prototype.listen = function(port, host, callback){
    if(!callback && typeof host=="function"){
        callback = host;
        host = undefined;
    }
    this._port = port;
    this._host = host;
    
    this._server.listen(port, host, function(err){
        if(err && !callback){
            this.emit("error", err);
        }else if(callback){
            callback(err || null);
        }
    });
}

/**
 * <p>Creates a server with listener callback</p> 
 */
RAIServer.prototype._createServer = function(){
    this._server = netlib.createServer(this._serverListener.bind(this));
}

/**
 * <p>Server listener that is run on client connection</p>
 * 
 * <p>{@link RAISocket} object instance is created based on the client socket
 *    and a <code>'connection'</code> event is emitted</p>
 * 
 * @param {Object} socket The socket to the client 
 */
RAIServer.prototype._serverListener = function(socket){
    if(this.options.debug){
        console.log("CONNECTION FROM "+socket.remoteAddress);
    }
    
    var handler = new RAISocket(socket, this.options);
    
    socket.on("data", handler._onReceiveData.bind(handler));
    socket.on("end", handler._onEnd.bind(handler));
    socket.on("error", handler._onError.bind(handler));
    socket.on("timeout", handler._onTimeout.bind(handler));
    socket.on("close", handler._onClose.bind(handler));

    this.emit("connection", handler);
}

/**
 * <p>Creates a instance for interacting with a client (socket)</p>
 * 
 * <p>Optional options object is the same that is passed to the parent
 * {@link RAIServer} object</p>
 * 
 * <p><b>Events</b></p>
 * 
 * <ul>
 *     <li><b>'command'</b> - emitted if a client sends a command. Gets two
 *         params - command (String) and payload (Buffer)</li>
 *     <li><b>'data'</b> - emitted when a chunk is received in data mode, the
 *         param being the payload (Buffer)</li>
 *     <li><b>'ready'</b> - emitted when data stream ends and normal command
 *         flow is recovered</li>
 *     <li><b>'tls'</b> - emitted when the connection is secured by TLS</li>
 *     <li><b>'error'</b> - emitted when an error occurs. Connection to the
 *         client is disconnected automatically. Param is an error object.</l>
 *     <li><b>'timeout'</b> - emitted when a timeout occurs. Connection to the
 *         client is disconnected automatically.</l>
 *     <li><b>'end'</b> - emitted when the client disconnects</l>
 * </ul>
 * 
 * @constructor
 * @param {Object} socket Socket for the client
 * @param {Object} [options] Optional options object
 */
function RAISocket(socket, options){
    EventEmitter.call(this);
    
    this.socket = socket;
    this.options = options || {};
    
    this.remoteAddress = socket.remoteAddress;
    
    this._dataMode = false;
    this._endDataModeSequence = /\r\n\.\r\n|^\.\r\n/;
    
    this._secureConnection = false;
    this._destroyed = false;
    this._remainder = "";
    
    this._ignore_data = false;
    
    if(this.options.timeout){
        socket.setTimeout(this.options.timeout);
    }
}
utillib.inherits(RAISocket, EventEmitter);

/**
 * <p>Sends some data to the client. <CR><LF> is automatically appended to
 *    the data</p>
 * 
 * @param {String|Buffer} data Data to be sent to the client
 */
RAISocket.prototype.send = function(data){
    var buffer;
    if(data instanceof Buffer || (typeof SlowBuffer != "undefined" && data instanceof SlowBuffer)){
        buffer = new Buffer(data.length+2);
        buffer[buffer.length-2] = 0xD;
        buffer[buffer.length-1] = 0xA;
        data.copy(buffer);
    }else{
        buffer = new Buffer((data || "").toString()+"\r\n", "binary");
    }
    
    if(this.options.debug){
        console.log("OUT: \"" +buffer.toString("utf-8").trim()+"\"");
    }
    
    this.socket.write(buffer);
}

/**
 * <p>Instructs the server to be listening for mixed data instead of line based
 *    commands</p>
 * 
 * @param {String|RegExp} [sequence="\r\n.\r\n"] - optional sequence for
 *        matching the data end 
 */
RAISocket.prototype.startDataMode = function(sequence){
    this._dataMode = true;
    if(sequence){
        this._endDataModeSequence = typeof sequence == "string" ? new RegExp(sequence) : sequence;
    }
}

/**
 * <p>Instructs the server to upgrade the connection to secure TLS connection</p>
 * 
 * <p>Emits <code>'tls'</code> on successful upgrade</p>
 * 
 * @param {Object} [credentials] - An object with PEM encoded key and 
 *        certificate <code>{key:"---BEGIN...", cert:"---BEGIN..."}</code>,
 *        if not set autogenerated values will be used.
 */
RAISocket.prototype.startTLS = function(credentials){
    if(this._secureConnection){
        this._onError(new Error("Secure connection already established"));
    }
    
    credentials = credentials || defaultCredentials;
    
    this._ignore_data = true;
    
    var secure_connector = starttls(this.socket, credentials, (function(ssl_socket){

        if(this.options.debug && !ssl_socket.authorized){
            console.log("WARNING: TLS ERROR ("+ssl_socket.authorizationError+")");
        }
        
        this._remainder = "";
        this._ignore_data = false;
        
        this._secureConnection = true;
    
        this.socket = ssl_socket;
        this.socket.on("data", this._onReceiveData.bind(this));
        
        if(this.options.debug){
            console.log("TLS CONNECTION STARTED");
        }
        
        this.emit("tls");
        
    }).bind(this));
    
    secure_connector.on("error", (function(err){
        this._onError(err);
    }).bind(this));
}

/**
 * <p>Closes the connection to the client</p>
 */
RAISocket.prototype.end = function(){
    this.socket.end();
}

/**
 * <p>Called when a chunk of data arrives from the client. If currently in data
 * mode, transmit the data otherwise send it to <code>_processData</code></p>
 * 
 * @param {Buffer|String} chunk Data sent by the client
 */
RAISocket.prototype._onReceiveData = function(chunk){
    if(this._ignore_data){ // if currently setting up TLS connection
        return;
    }
    
    var str = typeof chunk=="string"?chunk:chunk.toString("binary"),
        dataEndMatch, dataRemainderMatch, data;
    
    if(this._dataMode){
        
        str = this._remainder + str;
        
        if(dataEndMatch = str.match(/\r\n.*?$/)){
            // if theres a line that is not ended, keep it for later
            this._remainder = str.substr(dataEndMatch.index);
            str = str.substr(0, dataEndMatch.index);
        }else{
            this._remainder = "";
        }
        
        if((dataRemainderMatch = (str+this._remainder).match(this._endDataModeSequence))){
            if(dataRemainderMatch.index){
                data = new Buffer((str+this._remainder).substr(0, dataRemainderMatch.index), "binary");
                if(this.options.debug){
                    console.log("DATA:", data.toString("utf-8"));
                }
                this.emit("data", data);
            }
            this._remainder = "";
            this.emit("ready");
            this._dataMode = false;
            
            // send the remaining data for processing
            this._processData(str.substr(dataRemainderMatch.index + dataRemainderMatch[0].length));
        }else{
            data = new Buffer(str, "binary");
            if(this.options.debug){
                console.log("DATA:", data.toString("utf-8"));
            }
            this.emit("data", data);
        }
    }else{
        this._processData(str);
    }
    
}

/**
 * <p>Processed incoming command lines and emits found data as 
 * <code>'command'</code> with the command name as the first param and the rest
 * of the data as second (Buffer)</p>
 * 
 * @param {String} str Binary string to be processed
 */
RAISocket.prototype._processData = function(str){
    if(!str.length){
        return;
    }
    var lines = (this._remainder+str).split("\r\n"),
        match, command;
        
    this._remainder = lines.pop();
    
    for(var i=0, len = lines.length; i<len; i++){
        if(!this._dataMode){
            if(match = lines[i].match(/\s*[\S]+\s?/)){
                command = (match[0] || "").trim();
                if(this.options.debug){
                    console.log("COMMAND:", lines[i]);
                }
                this.emit("command", command, new Buffer(lines[i].substr(match.index + match[0].length), "binary"));
            }
        }else{
            if(this._remainder){
                this._remainder += "\r\n";
            }
            this._onReceiveData(lines.slice(i).join("\r\n"));
            break;
        }
    }
    
}

/**
 * <p>Called when the connection is or is going to be ended</p> 
 */
RAISocket.prototype._destroy = function(){
    if(this._destroyed)return;
    this._destroyed = true;
    
    this.removeAllListeners();
}

/**
 * <p>Called when the connection is ended. Emits <code>'end'</code></p>
 */
RAISocket.prototype._onEnd = function(){
    this.emit("end");
    this._destroy();
}

/**
 * <p>Called when an error has appeared. Emits <code>'error'</code> with
 * the error object as a parameter.</p>
 * 
 * @param {Object} err Error object
 */
RAISocket.prototype._onError = function(err){
    this.emit("error", err);
    this._destroy();
}

/**
 * <p>Called when a timeout has occured. Connection will be closed and
 * <code>'timeout'</code> is emitted.</p>
 */
RAISocket.prototype._onTimeout = function(){
    if(this.socket && !this.socket.destroyed){
        this.socket.end();
    }
    this.emit("timeout");
    this._destroy();
}

/**
 * <p>Called when the connection is closed</p>
 * 
 * @param {Boolean} hadError did the connection end because of an error?
 */
RAISocket.prototype._onClose = function(hadError){
    this._destroy();
}