module.exports = function(RED) {
    RED.httpAdmin.get("/static/*", function (req, res) {
        var options = {
          root: __dirname + "/static/",
          dotfiles: "deny",
        };
        res.sendFile(req.params[0], options);
      });

      

    function Ctds(sn, id, client) {
        this.sn = sn
        this.id = id
        this.client = client
    }

    function Output(id, name, type) {
        this.id = id;
        this.name = name;
        this.type = type;
    }

    GetCtds = function(devices) {
        var ctds = new Array();
        for (i = 0; i < devices.length; i++) {
            ctds.push(new Ctds(devices[i].ctdSn, devices[i].id, devices[i].client))
        }
        return ctds
    }

    getOutputs = function(devices, ctd){
        var output = []
        if (ctd != null && devices != null) {
            // Loop over devices
            var i = 0;
            for (i = 0; i < devices.length; i++) {
                // Only get outputs from device.Serial = selected ctd serial
                //console.log('Getting outputs ' + ctd + ' - ' + type)
                if (ctd == devices[i].id){
                    // Get outputs
                    var outputs = devices[i].outputArray
                    
                    // Loop over outputs
                    var j=0
                    for (j = 0; j < outputs.length; j++) {
                        output.push(new Output(outputs[j].id, outputs[j].name, outputs[j].type))
                    }
                }
            }
        }
        return output
    }

   

    class QbusOutputNode {
        constructor(n) {
            RED.nodes.createNode(this,n);

            var node = this
            node.config = n;

            node.mqttClient = node.config.client

            node.outputList = []

            if (node.mqttClient) {
                node.clientconn = RED.nodes.getNode(node.mqttClient)

                
                

                if (node.clientconn != null) {
                    //node.clientconn = node.client.clientconn
                    node.ctdid = node.config.selCtdUL
                    //node.outpid = node.config.selOutput
                    node.name = node.config.selOutputName

                    node.outputarray = node.config.selOutputs

                    node.globalContext = node.context().global;
                    var devices = node.globalContext.get("devices")
                    // Get outputs 
                    var outps = []
                    outps = getOutputs(devices, node.ctdid);
                    node.globalContext.set("outputs",outps)

                    // Send controller list to html dropdownbox
                    RED.httpAdmin.get("/qbus-client/ctds",  function(req, res) {
                        // Get all controllers
                        node.globalContext = node.context().global;
                        var devs = node.globalContext.get("devices")
                        var ctds = GetCtds(devs)
                        RED.log.debug("qbus.js - ctd's: " + ctds[0].sn);
                        res.json(ctds);
                    });

                    // Send output list to html dropdownbox
                    RED.httpAdmin.get("/qbus-client/outputs", function(req, res) {
                        var ctd = req.query.ctd
                        var type = req.query.type
                        
                        // Get all devices
                        node.globalContext = node.context().global;
                        var devices = node.globalContext.get("devices")

                        outps = getOutputs(devices, ctd, "");
                        node.globalContext.set("outputs",outps)
                        res.json(outps);
                    });

                    if (node.ctdid && node.outputarray) {
                        //node.log(node.ctdid)
                        node.listener_onMQTTMessage = function(data) { node.onMQTTMessage(data); }
                        node.clientconn.on('onMQTTMessage', node.listener_onMQTTMessage);
                        
                        var items = []
                        items = node.outputarray

                        items.forEach(loopOutputIds)

                        function loopOutputIds(item, index, arr) {
                            subscribe(arr[index]);

                        }

                        requestState(items)

                        node.on("input", function(msg) {
                            var items = []
                            items = node.outputarray

                            items.forEach(loopOutputIds)

                            function loopOutputIds(item, index, arr) {
                                var cmd = '{"id":"' + arr[index] + '","type":"state","properties":{"' + msg.topic + '":' + msg.payload + '}}'
                                var topic = "cloudapp/QBUSMQTTGW/" + node.ctdid + "/" + arr[index] + "/setState"
                                node.clientconn.mqtt.publish(topic, cmd,
                                        {'qos':parseInt(node.clientconn.config.mqtt_qos||0)},
                                        function(err) {
                                            if (err) {
                                                node.error(err);
                                            }
                                });
                            }
                        })

                        node.on('close', function(done) {
                            done();
                        })

                        function requestState(devs) {
                            var cmd = JSON.stringify(devs);
                            var topic = "cloudapp/QBUSMQTTGW/getState"
            
                            node.clientconn.mqtt.publish(topic, cmd,
                                    {'qos':parseInt(node.clientconn.config.mqtt_qos||0)},
                                    function(err) {
                                        if (err) {
                                            node.error(err);
                                        }
                            });
                        }
            
                        function subscribe(outputid) {
                            node.clientconn.subscribeMQTT("cloudapp/QBUSMQTTGW/" + node.ctdid + "/" + outputid + "/state")
                            node.clientconn.subscribeMQTT("cloudapp/QBUSMQTTGW/" + node.ctdid + "/" + outputid + "/event")
                        }
                    }
                } else {
                    RED.httpAdmin.get("/qbus-client/ctds",  function(req, res) {
                        res.json({});
                    });
                    RED.httpAdmin.get("/qbus-client/outputs", function(req, res) {
                        res.json({});
                    });
                }
            }
        }

        onStateUpdate(state) {
            var node = this;
            var  msg = {}
            msg.payload = state.payload;
            
            if (state.state === true){
                node.status({fill:"green", shape:"dot", text:"Connected."});
            } else if (state.payload == "No connection with MQTT Server"){
                node.status({fill:"red", shape:"dot", text:"No connection with MQTT Server."});
            } else if (state.payload == "Connected with MQTT Server"){
                node.status({fill:"red", shape:"dot", text:"Connected with MQTT Server."});
            } else if (state.state === false){
                node.status({fill:"red", shape:"dot", text:"No connection with controller."});
            }
        }

        onMQTTMessage(topic, message) {
            let node = this;
            let pl = JSON.parse(topic.payload)
            let  msg = {}
            if (node.outputarray.includes(pl.id) ) {
                node.globalContext = node.context().global;
                    msg.topic = pl.type;
                    let outps = node.globalContext.get("outputs")
                    let obj = outps.find(o => o.id === pl.id);
                    msg.name = obj.name
                    msg.outputId = obj.id;
                    msg.ctdId = node.ctdid;
                    msg.payload = pl.properties;
                    node.status({fill:"green", shape:"ring", text:"Connected"});
               // }
                node.send(msg);
            }
        }

        

}
    RED.nodes.registerType("qbus-output",QbusOutputNode);
}