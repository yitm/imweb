/*
 * require modules
 */
var koa = require('koa');   // koa框架
var route = require('koa-route');   // koa路由模块
var views = require('co-views');  // co视图模板中间件
var parse = require('co-body');  // co请求中间件
var fs = require('fs');  // 文件模块
var thunkify = require('thunkify');  // 文件中间件
var config = require('./config');  // 配置文件
var ejs = require('ejs');  //ejs

var app = koa();

var io = require('socket.io')(app);  // socket.io

var render = views(__dirname + '/view/', {
  map: { html: 'ejs' }
});

// 初始化读文件操作
var readFile = thunkify(fs.readFile);
// 初始化写文件操作
var writeFile = thunkify(fs.writeFile);
// 初始化读文件路径操作
var readDir = thunkify(fs.readdir);


var maindata = {
    title: "IM Web",
    desc: "This a IM Web",
    version: "0.0.1",
}

// route middleware

app.use(route.get('/', index));
app.use(route.get('/get', get));
app.use(route.get('/history/:date', history));
app.use(route.post('/post', post));


var server = require('http').Server(app.callback()),
    io = require('socket.io')(server);

// 首页
function *index(){
    var cookie = this.cookies.get("msgid");
    var msglist = '';
    if(isEmpty(cookie)){
        var msglist = yield readjson();
        this.cookies.set('msgid', msglist.MsgList.length, {httpOnly: false});
    }
    
    var main = {
        maindata: maindata,
        msglist: msglist.MsgList || ''
    };
    this.body = yield render('main', main);
}

// ejs注册IP过滤器
ejs.filters.ipFilters = function(value){
    var ipVal = value.split(',')[0];
    var _ip = ipVal.split(".");
    _ip[3] = "*";
    _ip = _ip.join(".");
    return _ip;
}

// ejs注册日期过滤器
ejs.filters.formatDate = function(value){
    var date = new Date(value);
    var y = date.getFullYear();
    var m = fmtNum(date.getMonth()+1);
    var d = fmtNum(date.getDate());
    var h = fmtNum(date.getHours());
    var i = fmtNum(date.getMinutes());
    var s = fmtNum(date.getSeconds());
    
    return y+"-"+m+"-"+d+" "+h+":"+i+":"+s;
    
    function fmtNum(n){
        if(Number(n) < 10) return '0'+n;
        return n;
    }
    
}

/*
 * 返回未读消息
 * @param id 已读取的数据的ID
 * @return {object}
 */
function *get(){
    
    var getckID = this.cookies.get('msgid');
    
    var getdata = yield readjson();
    var list = [];
    var i = Number(getckID), j = 0;
    for(var i = Number(getckID); i < getdata.MsgList.length; i++){
        list[j] = getdata.MsgList[i];
        j++;
    }
    var num = Number(getckID)+Number(j);
    this.cookies.set('msgid', num, {httpOnly: false});
    this.body = success(1000, '请求成功', list);
}

// 请求获取
function *post(){
    var post = yield parse(this);
    var date = new Date();
    post.date = date;
    post.ip = this.ip;
    
    yield writejson(post);
    this.body = success(1000, '请求成功', post);
}

/*
 * 返回历史消息
 * @param date YYYYMMDD
 * @return {object}
 */
function *history(date){
    try{
        var path = config.cache_path+"/MsgData_"+date+".json";
        var msgdata = yield readFile(path, 'utf8');
        this.body = success(1000, '请求成功', JSON.parse(msgdata));
    }
    catch(err){
        this.body = success(1001, '请求成功');
    }
}

/*
 * socket.io服务
 */
io.on('connection', function(socket){

    socket.emit('login', success(1002, '链接成功')); //通知客户端已连接
    
    //监听用户发布聊天内容
    socket.on('message', function(obj){
        //向所有客户端广播发布的消息
        var post = obj;
        var date = new Date();
        post.date = date;
        post.ip = socket.request.headers['x-forwarded-for'] || socket.request.connection.remoteAddress || socket.request.socket.remoteAddress || socket.request.connection.socket.remoteAddress;
        io.emit('message', success(1000, '请求成功', post));
        writedata(post);

    });

});

function writedata(postdata){
    try{
        var path = config.cache_path+"/MsgData_"+date()+".json";
        fs.readFile(path, {encoding: 'utf8'}, function(err, msgdata){
            if (err) throw err;
            var msglist = JSON.parse(msgdata);
            msglist.MsgList.push(postdata);
            fs.writeFile(path, JSON.stringify(msglist), {encoding: 'utf8'}, function(err){
                if (err) throw err;
            });
        });
    }
    catch(err){
        return true;
    }
}

// 写入json文件
function *writejson(postdata){
    var msglist = yield readjson();
    msglist.MsgList.push(postdata);
    var path = config.cache_path+"/MsgData_"+date()+".json";
    yield writeFile(path, JSON.stringify(msglist), {encoding: 'utf8'});
    return true;
    
}

// 读取json文件
function *readjson(){
    
    var msgdir = yield readDir(config.cache_path);
    var path = config.cache_path+"/MsgData_"+date()+".json";
    
    // 如果当天没有数据，则创建一条新的数据
    if(msgdir[(msgdir.length-1)] != 'MsgData_'+date()+'.json'){
        
        var nowdate = new Date();
        // 默认数据
        var defmsgdata = {  
            "MsgList": [
                {
                    "msg" : "welcome IM",
                    "date" : nowdate,
                    "ip" : '' 
                }
            ]
        }
        yield writeFile(path, JSON.stringify(defmsgdata), {encoding: 'utf8'});
        return defmsgdata;
        
    }
    else{
        var msgdata = yield readFile(path, 'utf8');
        return JSON.parse(msgdata);
    }
}

/*
 * 日期
 * return {string}
 */
function date(){
    var date = new Date();
    var year = date.getFullYear();
    var month = date.getMonth()+1;
    if(month < 10){
        month = '0'+month;
    }
    var day = date.getDate();
    if(day < 10){
        day = '0'+day;
    }
    
    return year + month + day;
}

/**
 * 请求成功应答
 * @param  {[type]}  obj
 * @return {Object}
 */
function success(code, msg, data){
    var SuccessData = {
        errno: code || 0,
        errmsg: msg || '',
        data: data
    }
    return SuccessData;
}

/**
 * 判断对象是否为空
 * @param  {[type]}  obj
 * @return {Boolean}
 */
function isEmpty(obj) {
    if(obj == "" || obj == undefined || obj == null || obj.length == 0) return true;
    return false;
}
server.listen(process.env.VCAP_APP_PORT || config.port);