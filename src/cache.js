'use strict';

import NodeCache from 'node-cache';

export default function(RED) {
  class CacheNode {
    constructor(n) {
      RED.nodes.createNode(this, n);
      this.name = n.name;
      this.cache = new NodeCache({
        stdTTL : n.defaultTtl || 0,
        checkperiod : n.checkPeriod || 0
      });
      this.cache.nodeList = [];
      function addNode(node) {
        this.nodeList.push(node);
      }
      this.cache.addNode = addNode.bind(this.cache);
      function onChanged() {
        this.nodeList.forEach((n) => {
          n.emit('updated');
        });
      }
      this.cache.onChanged = onChanged.bind(this.cache);
      ['set', 'del', 'expired', 'flush'].forEach((e) => {
        this.cache.on(e, this.cache.onChanged);
      });
      this.on('close', () => {
        this.cache.close();
        delete this.cache;
      });
    }
  }
  RED.nodes.registerType('Cache', CacheNode);

  class CacheInNode {
    constructor(n) {
      RED.nodes.createNode(this, n);
      this.keyProperty = n.keyProperty || 'topic';
      this.valueProperty = n.valueProperty || 'payload';
      this.useString = n.useString;
      this.cacheMissRouting = n.outputs > 1;
      this.cacheNodeId = n.cache;
      this.cacheNode = RED.nodes.getNode(this.cacheNodeId);
      if (this.cacheNode) {
        this.cacheNode.cache.addNode(this);
        this.on('updated', () => { this.status({fill:'green',shape:'dot',text:RED._('cache.status.keys', {n:this.cacheNode.cache.getStats().keys})}); });
      }
      this.name = n.name;
      let sendMessage = (msg, cacheMiss) => {
        if (this.cacheMissRouting) {
          let ports = [];
          ports[cacheMiss ? 1 : 0] = msg;
          this.send(ports);
        } else {
          this.send(msg);
        }
      };

      let del = (msg, key) => {
        //删除key
        let count = this.cacheNode.cache.del(key);
        msg.payload=count;
        sendMessage(msg);
      };

      let dump = (msg, likeKey) => {
        //获取所有key-value
        this.cacheNode.cache.keys((err, keys) => {
          if (!err) {
            let filterKeys = []
            if(likeKey){
              keys.forEach(k=>{
                if(k.startsWith(likeKey)){
                  filterKeys.push(k)
                }
              });
            }
            this.cacheNode.cache.mget(filterKeys, (err, value) => {
                RED.util.setMessageProperty(msg, this.valueProperty, value);
                sendMessage(msg);
            });
          }
        });
      };

      let keys = (msg,likeKey) => {
        this.cacheNode.cache.keys((err, keys) => {
          if (!err) {
            let result = [];
            if(likeKey){
              keys.forEach(key=>{
                 if(key.startsWith(likeKey)){
                  result.push(key);
                }
              })
            }else{
              result = keys;
            }
            RED.util.setMessageProperty(msg, this.valueProperty, result);
            sendMessage(msg);
          }
        });
      };

      this.on('input', (msg) => {
        if (this.cacheNode) {
          let key = RED.util.getMessageProperty(msg, this.keyProperty);
          if(msg.option){
            if(msg.option === 'delete'){
              del(msg, key);
            }
            if(msg.option === 'dump'){
              dump(msg, key);
            }
            if(msg.option === 'keys'){
              keys(msg, key);
            }
          }else {
            if (key) {
              this.cacheNode.cache.get(key, (err, value) => {
                if (!err) {
                  let cacheMiss = (value === undefined);
                  RED.util.setMessageProperty(msg, this.valueProperty, ((value === '' || cacheMiss) ? null : value));
                  sendMessage(msg, cacheMiss);
                }
              });
            }
          }
        }
      });
      process.nextTick(() => {
        this.emit('updated');
      });
    }
  }
  RED.nodes.registerType('Cache in', CacheInNode);

  class CacheOutNode {
    constructor(n) {
      RED.nodes.createNode(this, n);
      this.keyProperty = n.keyProperty || 'topic';
      this.valueProperty = n.valueProperty || 'payload';
      this.ttlProperty = n.ttlProperty || '';
      this.useString = n.useString;
      this.cacheNodeId = n.cache;
      this.cacheNode = RED.nodes.getNode(this.cacheNodeId);
      if (this.cacheNode) {
        this.cacheNode.cache.addNode(this);
        this.on('updated', () => { this.status({fill:'green',shape:'dot',text:RED._('cache.status.keys', {n:this.cacheNode.cache.getStats().keys})}); });
      }
      this.name = n.name;
      this.on('input', (msg) => {
        console.info(msg.topic);
        if (this.cacheNode) {
          let key = RED.util.getMessageProperty(msg, this.keyProperty);
          if (key) {
            let value = RED.util.getMessageProperty(msg, this.valueProperty);
            if (this.ttlProperty) {
              let ttl = RED.util.getMessageProperty(msg, this.ttlProperty) || 0;
              this.cacheNode.cache.set(key, value, ttl);
            } else {
              this.cacheNode.cache.set(key, value);
            }
          }
        }
      });
      process.nextTick(() => {
        this.emit('updated');
      });
    }
  }
  RED.nodes.registerType('Cache out', CacheOutNode);
}
