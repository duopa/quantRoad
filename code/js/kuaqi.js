/**
 * Created by jinglong on 2018/12/13.
 */
// 全局变量
// 声明一个配置图表的 chart 对象
var chart = {
    __isStock: true,
    tooltip: {
        xDateFormat: '%Y-%m-%d %H:%M:%S, %A'
    },
    title: {
        text: '交易盈亏曲线图（详细）'
    },
    rangeSelector: {
        buttons: [{
            type: 'hour',
            count: 1,
            text: '1h'
        }, {
            type: 'hour',
            count: 2,
            text: '3h'
        }, {
            type: 'hour',
            count: 8,
            text: '8h'
        }, {
            type: 'all',
            text: 'All'
        }],
        selected: 0,
        inputEnabled: false
    },
    xAxis: {
        type: 'datetime'
    },
    yAxis: {
        title: {
            text: '价差'
        },
        opposite: false,
    },
    series: [{
        name: "上轨",
        id: "线1,up",
        data: []
    }, {
        name: "中轨",
        id: "线2,middle",
        data: []
    }, {
        name: "下轨",
        id: "线3,down",
        data: []
    }, {
        name: "basb",
        id: "线4,basb",
        data: []
    }, {
        name: "sabb",
        id: "线5,sabb",
        data: []
    }]
};
var ObjChart = Chart(chart); // 画图对象
var bars = []; // 存储价差序列
var oldTime = 0; // 记录历史数据时间戳

// 参数
var tradeTypeA = "this_week"; // 套利A合约
var tradeTypeB = "quarter"; // 套利B合约
var dataLength = 10; //指标周期长度
var timeCycle = 1; // K线周期
var name = "ETC"; // 币种
var unit = 1; // 下单量

// 基础数据
function Data(tradeTypeA, tradeTypeB) { // 传入套利A合约和套利B合约
    this.accountData = _C(exchange.GetAccount); // 获取账户信息
    this.positionData = _C(exchange.GetPosition); // 获取持仓信息
    var recordsData = _C(exchange.GetRecords); //获取K线数据
    exchange.SetContractType(tradeTypeA); // 订阅套利A合约
    var depthDataA = _C(exchange.GetDepth); // 套利A合约深度数据
    exchange.SetContractType(tradeTypeB); // 订阅套利B合约
    var depthDataB = _C(exchange.GetDepth); // 套利B合约深度数据
    this.time = recordsData[recordsData.length - 1].Time; // 获取最新数据时间
    this.askA = depthDataA.Asks[0].Price; // 套利A合约卖一价
    this.bidA = depthDataA.Bids[0].Price; // 套利A合约买一价
    this.askB = depthDataB.Asks[0].Price; // 套利B合约卖一价
    this.bidB = depthDataB.Bids[0].Price; // 套利B合约买一价
    // 正套价差(合约A卖一价 - 合约B买一价)
    this.basb = depthDataA.Asks[0].Price - depthDataB.Bids[0].Price;
    // 反套价差(合约A买一价 - 合约B卖一价)
    this.sabb = depthDataA.Bids[0].Price - depthDataB.Asks[0].Price;
}

// 获取持仓
Data.prototype.mp = function (tradeType, type) {
    var positionData = this.positionData; // 获取持仓信息
    for (var i = 0; i < positionData.length; i++) {
        if (positionData[i].ContractType == tradeType) {
            if (positionData[i].Type == type) {
                if (positionData[i].Amount > 0) {
                    return positionData[i].Amount;
                }
            }
        }
    }
    return false;
}

// 合成新K线数据和boll指标数据
Data.prototype.boll = function (num, timeCycle) {
    var self = {}; // 临时对象
    // 正套价差和反套价差中间值
    self.Close = (this.basb + this.sabb) / 2;
    if (this.timeA == this.timeB) {
        self.Time = this.time;
    } // 对比两个深度数据时间戳
    if (this.time - oldTime > timeCycle * 60000) {
        bars.push(self);
        oldTime = this.time;
    } // 根据指定时间周期，在K线数组里面传入价差数据对象
    if (bars.length > num * 2) {
        bars.shift(); // 控制K线数组长度
    } else {
        return;
    }
    var boll = TA.BOLL(bars, num, 2); // 调用talib库中的boll指标
    return {
        up: boll[0][boll[0].length - 1], // boll指标上轨
        middle: boll[1][boll[1].length - 1], // boll指标中轨
        down: boll[2][boll[2].length - 1] // boll指标下轨
    } // 返回一个处理好的boll指标数据
}

// 下单
Data.prototype.trade = function (tradeType, type) {
    exchange.SetContractType(tradeType); // 下单前先重新订阅合约
    var askPrice, bidPrice;
    if (tradeType == tradeTypeA) { // 如果是A合约下单
        askPrice = this.askA; // 设置askPrice
        bidPrice = this.bidA; // 设置bidPrice
    } else if (tradeType == tradeTypeB) { // 如果是B合约下单
        askPrice = this.askB; // 设置askPrice
        bidPrice = this.bidB; // 设置bidPrice
    }
    switch (type) { // 匹配下单模式
        case "buy":
            exchange.SetDirection(type); // 设置下单模式
            return exchange.Buy(askPrice, unit);
        case "sell":
            exchange.SetDirection(type); // 设置下单模式
            return exchange.Sell(bidPrice, unit);
        case "closebuy":
            exchange.SetDirection(type); // 设置下单模式
            return exchange.Sell(bidPrice, unit);
        case "closesell":
            exchange.SetDirection(type); // 设置下单模式
            return exchange.Buy(askPrice, unit);
        default:
            return false;
    }
}

// 取消订单
Data.prototype.cancelOrders = function () {
    Sleep(500); // 撤单前先延时，因为有些交易所你懂的
    var orders = _C(exchange.GetOrders); // 获取未成交订单数组
    if (orders.length > 0) { // 如果有未成交的订单
        for (var i = 0; i < orders.length; i++) { //遍历未成交订单数组
            exchange.CancelOrder(orders[i].Id); //逐个取消未成交的订单
            Sleep(500); //延时0.5秒
        }
        return false; // 如果取消了未成交的单子就返回false
    }
    return true; //如果没有未成交的订单就返回true
}

// 处理持有单个合约
Data.prototype.isEven = function () {
    var positionData = this.positionData; // 获取持仓信息
    var type = null; // 转换持仓方向
    // 如果持仓数组长度余2不等于0或者持仓数组长度不等于2
    if (positionData.length % 2 != 0 || positionData.length != 2) {
        for (var i = 0; i < positionData.length; i++) { // 遍历持仓数组
            if (positionData[i].Type == 0) { // 如果是多单
                type = 10; // 设置下单参数
            } else if (positionData[i].Type == 1) { // 如果是空单
                type = -10; // 设置下单参数
            }
            // 平掉所有仓位
            this.trade(positionData[i].ContractType, type, positionData[i].Amount);
        }
    }
}

// 画图
Data.prototype.drawingChart = function (boll) {
    var nowTime = new Date().getTime();
    ObjChart.add([0, [nowTime, boll.up]]);
    ObjChart.add([1, [nowTime, boll.middle]]);
    ObjChart.add([2, [nowTime, boll.down]]);
    ObjChart.add([3, [nowTime, this.basb]]);
    ObjChart.add([4, [nowTime, this.sabb]]);
    ObjChart.update(chart);
}

// 交易条件
function onTick() {
    var data = new Data(tradeTypeA, tradeTypeB); // 创建一个基础数据对象
    var accountStocks = data.accountData.Stocks; // 账户余额
    var boll = data.boll(dataLength, timeCycle); // 获取boll指标数据
    if (!boll) return; // 如果没有boll数据就返回
    // 价差说明
    // basb = (合约A卖一价 - 合约B买一价)
    // sabb = (合约A买一价 - 合约B卖一价)
    if (data.sabb > boll.middle && data.sabb < boll.up) { // 如果sabb高于中轨
        if (data.mp(tradeTypeA, 0)) { // 下单前检测合约A是否有多单
            data.trade(tradeTypeA, "closebuy"); // 合约A平多
        }
        if (data.mp(tradeTypeB, 1)) { // 下单前检测合约B是否有空单
            data.trade(tradeTypeB, "closesell"); // 合约B平空
        }
    } else if (data.basb < boll.middle && data.basb > boll.down) { // 如果basb低于中轨
        if (data.mp(tradeTypeA, 1)) { // 下单前检测合约A是否有空单
            data.trade(tradeTypeA, "closesell"); // 合约A平空
        }
        if (data.mp(tradeTypeB, 0)) { // 下单前检测合约B是否有多单
            data.trade(tradeTypeB, "closebuy"); // 合约B平多
        }
    }
    if (accountStocks * Math.max(data.askA, data.askB) > 1) { // 如果账户有余额
        if (data.basb < boll.down) { // 如果basb价差低于下轨
            if (!data.mp(tradeTypeA, 0)) { // 下单前检测合约A是否有多单
                data.trade(tradeTypeA, "buy"); // 合约A开多
            }
            if (!data.mp(tradeTypeB, 1)) { // 下单前检测合约B是否有空单
                data.trade(tradeTypeB, "sell"); // 合约B开空
            }
        } else if (data.sabb > boll.up) { // 如果sabb价差高于上轨
            if (!data.mp(tradeTypeA, 1)) { // 下单前检测合约A是否有空单
                data.trade(tradeTypeA, "sell"); // 合约A开空
            }
            if (!data.mp(tradeTypeB, 0)) { // 下单前检测合约B是否有多单
                data.trade(tradeTypeB, "buy"); // 合约B开多
            }
        }
    }
    data.cancelOrders(); // 撤单
    data.drawingChart(boll); // 画图
    data.isEven(); // 处理持有单个合约
}

//入口函数
function main() {
    // 过滤控制台中不是很重要的信息
    SetErrorFilter("429|GetRecords:|GetOrders:|GetDepth:|GetAccount|:Buy|Sell|timeout|Futures_OP");
    exchange.IO("currency", name + '_USDT'); //设置要交易的数字货币币种
    ObjChart.reset(); //程序启动前清空之前绘制的图表
    LogProfitReset(); //程序启动前清空之前的状态栏信息
    while (true) { // 进入轮询模式
        onTick(); // 执行onTick函数
        Sleep(500); // 休眠0.5秒
    }
}