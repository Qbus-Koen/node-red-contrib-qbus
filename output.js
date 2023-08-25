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

    getOutputs = function(devices, ctd, type){
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

            

            if (node.mqttClient) {
                node.clientconn = RED.nodes.getNode(node.mqttClient)

                if (node.clientconn != null) {
                    //node.clientconn = node.client.clientconn
                    node.ctdid = node.config.ctdSn
                    node.outpid = node.config.selOutput
                    node.name = node.config.selOutputName

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
                        var outps = []
                        // Get all devices
                        node.globalContext = node.context().global;
                        var devices = node.globalContext.get("devices")
                        // Get outputs by type
                        outps = getOutputs(devices, ctd, type);
                        // Get state of outputs
                        //var outpString = JSON.stringify(outps);
                        /*
                        var cmd = outpString
                        var topic = "cloudapp/QBUSMQTTGW/getState";
                        
                        node.serverConn.mqtt.publish(topic, cmd, {'qos':parseInt(0)},function(err) {
                            if (err) {
                                node.error(err);
                            }
                        });
                        */
                        // return outputs
                        res.json(outps);
                    });

                    if (node.ctdid && node.outpid) {
                        //node.log('Output ctdid ' + node.ctdid);
                        //node.log('Output outpid ' + node.outpid);

                        node.listener_onMQTTMessage = function(data) { node.onMQTTMessage(data); }
                        node.clientconn.on('onMQTTMessage', node.listener_onMQTTMessage);

                        //node.listener_onStateUpdate = function(state) { node.onStateUpdate(state); }
                        //node.clientConn.on('onStateUpdate', node.listener_onStateUpdate);

                        subscribe()
                        requestState()

                        node.on("input", function(msg) {
                            var cmd = '{"id":"' + node.outpid + '","type":"state","properties":{"' + msg.topic + '":' + msg.payload + '}}'
                            var topic = "cloudapp/QBUSMQTTGW/" + node.ctdid + "/" + node.outpid + "/setState"
                            node.clientconn.mqtt.publish(topic, cmd,
                                    {'qos':parseInt(node.clientconn.config.mqtt_qos||0)},
                                    function(err) {
                                        if (err) {
                                            node.error(err);
                                        }
                            });
                        })

                        node.on('close', function(done) {
                            done();
                        })

                        function requestState() {
                            var devs = []
                            devs.push(node.outpid)
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
            
                        function subscribe() {
                            node.clientconn.subscribeMQTT("cloudapp/QBUSMQTTGW/" + node.ctdid + "/" + node.outpid + "/state")
                            node.clientconn.subscribeMQTT("cloudapp/QBUSMQTTGW/" + node.ctdid + "/" + node.outpid + "/event")
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
            var node = this;
            var pl = JSON.parse(topic.payload)
            var  msg = {}
            if (node.outpid === pl.id) {
                //if (pl.properties.hasOwnProperty("value")){
                //    msg.topic = "value";
                //    msg.payload = pl.properties.value;
                //    msg.name = node.name;
                //    msg.outputId = node.outpid;
                //    msg.ctdId = node.ctdid;
                //    node.status({fill:"green", shape:"ring", text:"Value: " + msg.payload});
                //} else {
                    msg.topic = "state";
                    msg.name = node.name;
                    msg.outputId = node.outpid;
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