var http = require('http');
var encoding = require("encoding");
var express = require('express'),
    app = module.exports.app = express();

var server = http.createServer(app);
var io = require('socket.io').listen(server);  //pass a http.Server instance
server.listen(8081);
console.log('Сервер клиентских приложений TaxiDispatcher запущен на порту 8081...');

var sql = require('mssql');
var clientsLimit = 50;
var clientsCount = 0; 
 
var config = {
    user: 'app_server',
    password: 'app_server',
    server: '192.168.0.90\\SQLEXPRESS', // You can use 'localhost\\instance' to connect to named instance 
    database: 'TDTwoRelease0408',
    
    options: {
        encrypt: false // Use this if you're on Windows Azure 
    }
}

console.log('Start test db-connection...');
var connection_test = new sql.Connection(config, function(err) {
	if(err)	{    
		console.log(err.message);                      // Canceled. 
		console.log(err.code); 
	}	else	{      

		var request = new sql.Request(connection_test);  
		request.query('select COUNT(*) as number FROM Voditelj WHERE V_rabote=1', function(err, recordset) {

        console.log(recordset);
    });

   }
  console.log('End test db-connection.');
    
  });

function findClientsSocket(roomId, namespace) {
    var res = []
    , ns = io.of(namespace ||"/");    // the default namespace is "/"

    if (ns) {
        for (var id in ns.connected) {
            if(roomId) {
                var index = ns.connected[id].rooms.indexOf(roomId) ;
                if(index !== -1) {
                    res.push(ns.connected[id]);
                }
            } else {
                res.push(ns.connected[id]);
            }
        }
    }
    return res;
}

function showClients()	{
	var currentDate = '[' + new Date().toUTCString() + '] ';
        var clcnt = 0;
	console.log(currentDate);
	var resC = findClientsSocket();
	for(i=0;i<findClientsSocket().length;i++)	{
		console.log(resC[i].id);
                clcnt++;
        }
        clientsCount=clcnt;
	return false;
}

setInterval( showClients, 10000);

io.sockets.on('connection', function (socket) {
  console.log('New sock id: '+socket.id);	
  var reqTimeout=0;
  var reqCancelTimeout=0;
  var stReqTimeout=0;
  var authTimeout=0;
  var clientActiveTime=0;
  
  function decReqTimeout()	{
	  if(reqTimeout>0)
		  reqTimeout--;
	  if(stReqTimeout>0)
		  stReqTimeout--;
	  if(reqCancelTimeout>0)
		  reqCancelTimeout--;
	  if(authTimeout>0)
		  authTimeout--;
  }
  
  setInterval(decReqTimeout, 1000);
  
  if((clientsCount+1)>clientsLimit)	{
	  socket.emit('server overload', { me: -1 });
	  try	{
		socket.disconnect('server overload');
	  } catch(e)	{
		  console.log('error socket disconnect'); 
	  }
	  try	{
		socket.close();
	  } catch(e)	{
		  console.log('error socket close'); 
	  }
	  return;
  }	else	{
	  console.log('client connect, num='+clientsCount);
	  clientsCount++;
  }
  
  socket.emit('news', { hello: 'worlds' });
  var connection = new sql.Connection(config, function(err) {
    // ... error checks 
	if(err)	{    
		console.log(err.message);                      // Canceled. 
		console.log(err.code); 
	}	else	{      
		// Query 
		var request = new sql.Request(connection); // or: var request = connection.request(); 
		request.query('select COUNT(*) as number FROM Voditelj WHERE V_rabote=1', function(err, recordset) {
        // ... error checks 
        //socket.emit('news', { dr_count: -1 });//recordset[0].number
        console.dir(recordset);
    });
	
	}
    
  });
  
  socket.on('my other event', function (data) {
    console.log(data);
  });
  
  function tryParseJSON (jsonString){
		try {
			var o = JSON.parse(jsonString);

			// Handle non-exception-throwing cases:
			// Neither JSON.parse(false) or JSON.parse(1234) throw errors, hence the type-checking,
			// but... JSON.parse(null) returns 'null', and typeof null === "object", 
			// so we must check for that, too.
			if (o && typeof o === "object" && o !== null) {
				return o;
			}
		}
		catch (e) { }

		return false;
	};
  
  socket.on('ident', function (data) {
	console.log(data);
	console.log("=======");
	console.log(typeof data);
	if(typeof data==='string')	{
		tp = tryParseJSON(data);
		console.log("=======");
		console.log(tp);
		if(tp)
			data = tp;
	}
	
    console.log("Identification, id="+data.id);
	console.log("Identification, phone="+data.phone);
	if(authTimeout<=0)	{
		authTimeout=20;
		var request = new sql.Request(connection);
		
		request.input('phone', sql.VarChar(255), data.phone);
		request.output('client_id', sql.Int, data.id);
		request.output('req_trust', sql.Int, 0);
		request.output('isagainr', sql.Int, 0);
		request.output('acc_status', sql.Int, 0);
		request.execute('CheckClientRegistration', function(err, recordsets, returnValue) {
			if(err)	{
				console.log('Error of CheckClientRegistration:'+err.message);                      // Canceled. 
				console.log('Error code:'+err.code);                         // ECANCEL //
			}	else	{
				console.log('CheckClientRegistration result client_id='+request.parameters.client_id.value);
				socket.emit('auth', { client_id: request.parameters.client_id.value,
						req_trust: request.parameters.req_trust.value,
						isagainr: request.parameters.isagainr.value,
						acc_status: request.parameters.acc_status.value
						});
			}
			
		//    console.dir(recordsets);
		});
	}	else
		console.log("Too many requests from "+data.phone);
  });
  
  function requestAndSendStatus(conn, cid, clphone, direct)	{
	if(stReqTimeout<=0||direct)	{
		stReqTimeout=40;
		var request = new sql.Request(conn);
		request.input('client_id', sql.Int, parseInt(cid));
		//request.input('adres', sql.VarChar(255), encoding.convert('привет мир','CP1251','UTF-8'));
		request.input('phone', sql.VarChar(255), clphone);
		request.input('full_data', sql.Int, 0);
		request.output('res', sql.VarChar(2000), '');
		request.execute('GetJSONRClientStatus', function(err, recordsets, returnValue) {
			if(err)	{
				console.log(err.message);                      // Canceled. 
				console.log(err.code);                         // ECANCEL //
			}	else	{
				console.log(request.parameters.res.value);
				socket.emit('clstat', { cl_status: request.parameters.res.value });
			}

		});
	} else
		console.log("Too many requests from "+clphone);
  }
  
  socket.on('status', function (data) {
	console.log(data);
	console.log("=======");
	console.log(typeof data);
	if(typeof data==='string')	{
		tp = tryParseJSON(data);
		console.log("=======");
		console.log(tp);
		if(tp)
			data = tp;
	}  
	  
    requestAndSendStatus(connection, data.cid);
	console.log("Status request: "+JSON.stringify(data));
  });
  
  socket.on('cancel order', function (data) {
	console.log(data);
	console.log("=======");
	console.log(typeof data);
	if(typeof data==='string')	{
		tp = tryParseJSON(data);
		console.log("=======");
		console.log(tp);
		if(tp)
			data = tp;
	}  
	  
	console.log('cancel orders '+data.phone);  //[CancelOrdersRClient]reqCancelTimeout
	if(reqCancelTimeout<=0)	{
	//requestAndSendStatus(connection, data.id, data.phone);
	
	var request2 = new sql.Request(connection); // or: var request = connection.request(); 
    request2.query('EXEC	[dbo].[CancelOrdersRClient] @phone = N\''+data.phone+'\', @client_id = '+data.id, 
		function(err, recordset) {
			requestAndSendStatus(connection, data.id, data.phone, true);
			if(err)	{
				console.log(err.message);                      // Canceled. 
				console.log(err.code);                         // ECANCEL 
			}
			else	{
				console.log(recordset);
				//requestAndSendStatus(connection, data.id, data.phone);
			}
		});
	}	else
		socket.emit('req_decline', { status: "many_new_order_req" });
	reqCancelTimeout=60;
  });

  socket.on('ccoords', function (data) {
	console.log(data);
	console.log("=======");
	console.log(typeof data);
	if(typeof data==='string')	{
		tp = tryParseJSON(data);
		console.log("=======");
		console.log(tp);
		if(tp)
			data = tp;
	}  
	  
	console.log('ccoords '+data.phone+', lat='+data.clat+', lon='+data.clon);  //[CancelOrdersRClient]reqCancelTimeout
	//if(reqCancelTimeout<=0)	{
	
	var request2 = new sql.Request(connection); // or: var request = connection.request(); 
    request2.query('EXEC	[dbo].[ApplyRClientCoords] @rclient_id='+data.id+', @lat = N\''+data.clat+'\', @lon = N\''+data.clon+'\'', 
		function(err, recordset) {
			//requestAndSendStatus(connection, data.id, data.phone, true);
			if(err)	{
				console.log(err.message);                      // Canceled. 
				console.log(err.code);                         // ECANCEL 
			}
			else	{
				console.log('Success apply coords');
				//requestAndSendStatus(connection, data.id, data.phone);
			}
		});
	//}	else
	//	socket.emit('req_decline', { status: "many_new_order_req" });
	//reqCancelTimeout=60;
  });
  
  socket.on('new order', function (data) {
	console.log(data);
	console.log("=======");
	console.log(typeof data);
	if(typeof data==='string')	{
		tp = tryParseJSON(data);
		console.log("=======");
		console.log(tp);
		if(tp)
			data = tp;
	}  
	  
    console.log('++'+data);
	var out='';	
	var dat = data;//['dr_count']
	for(var prop in dat)
	//if (prop=='NUMBER')		
		out+=dat[prop];
	console.log(out);
	
	
	if(reqTimeout<=0)	{
	stReqTimeout=0;
	
	
	var request2 = new sql.Request(connection); // or: var request = connection.request(); 
	try	{
		enadr_val='->'+data.enadr;
		if(!enadr_val)
			enadr_val='';
		else if(enadr_val.length<=2)
			enadr_val='';
	} catch(e)	{
		enadr_val='';
	}
    request2.query('EXEC	[dbo].[InsertOrderWithParamsRClient] @adres = N\''+data.stadr+enadr_val+'\',@phone = N\''+data.phone+'\','+
		'@disp_id = -1, @status = 0, @color_check = 0, @op_order = 0, @gsm_detect_code = 0,'+
		'@deny_duplicate = 0, @colored_new = 0, @ab_num = N\'\', @client_id = '+data.id+', @ord_num = 0,@order_id = 0', 
		function(err, recordset) {
			requestAndSendStatus(connection, data.id, data.phone, true);
			if(err)	{
				console.log(err.message);                      // Canceled. 
				console.log(err.code);                         // ECANCEL 
			}
			else	{
				console.log(recordset);
			}
		});
	}	else
		socket.emit('req_decline', { status: "many_new_order_req" });
	reqTimeout=60;
	
  });
  socket.on('disconnect', function () {
    console.log('user disconnected');
	clientsCount--;
  });
});


 
