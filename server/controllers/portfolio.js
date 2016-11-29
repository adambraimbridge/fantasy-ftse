import {MongoClient} from 'mongodb';

import fetch from 'node-fetch';

export {
	create,
	read,
	buy,
	sell
};

const newPortfolio = {
	id: "",
	value: 0.00,
	cash : 10000.00,
	holdings: {},
	rank: 0,
	history : []
};

const newHolding = {
	id :"",
	name: "",
	quantity : 0
};

const newHistory = {
	date: null,
	portfolio : {}
};

function getConnection(){
	return Promise.resolve(MongoClient.connect(process.env.MONGOHQ_URL));
}

function create(req, res) {
	var uuid = req.get('user');
	var p = Object.assign({}, newPortfolio);
	p.id = req.get('userId');
	getConnection().then((db)=>{
		db.collection('portfolios').deleteOne({id:p.id})
		.then((r)=>{
			console.log(`Deleted ${r.deletedCount}`);
			db.collection('portfolios').insertOne(p);
			res.set("location", "http://");
			delete p["_id"];
			db.close();
			res.status(201).json(p);
		});
	})
	.catch((err)=>{
		res.status(500).json({err});
	});
}


function read(req, res) {
	var id = req.get('userId');
	getConnection().then((db)=>{
		db.collection('portfolios').findOne({id})
		.then((r)=>{
			console.log(r);
			delete r["_id"];
			db.close();
			res.status(201).json(r);
		});
	})
	.catch((err)=>{
		res.status(500).json({err});
	});
}

function addStockInfo(req, res) {
	var stock=req.body.tickerId;
	return fetch(`http://dev.markitondemand.com/MODApis/Api/v2/Quote/json?symbol=${stock}`)
	.then ((apiRes) => {
		console.log(apiRes.status);
		return apiRes.json();
	})
	.then((mdResp) => {
		console.log(mdResp);
		if (mdResp.Status === "SUCCESS") {
			console.log(req.body);
			req.body.price = mdResp.LastPrice;
			req.body.stockName = mdResp.Name;
			console.log(req.body);
			return Promise.resolve(mdResp.Status);
		} else {
			return Promise.reject(mdResp.Status);
		}
	}).catch((err) => {
		console.log(err);
		throw err;
	});
}

function buy(req, res){
	addStockInfo(req, res)
	.then(()=>{
			return performTrade(req, res, true);
	})
	.catch((err) => {
		res.status(500).json({err});
	});
}

function sell(req, res){
	addStockInfo(req, res)
	.then(()=>{
			return performTrade(req, res, false);
	})
	.catch((err) => {
		res.status(500).json({err});
	});
}

function performTrade(req, res, isBuy) {
	var stock=req.body.tickerId;
	var stockName = req.body.stockName;
	var quantity=req.body.quantity;
	var price = req.body.price;
	console.log(`performTrade: ${isBuy?"Buy":"Sell"} ${quantity} of ${stock} @ ${price}`);
	var db;
	return getConnection()
	.then((d)=>{
		db=d;
		return d.collection('portfolios').findOne({id:req.get("userId")});
	})
	.then((r)=>{
		console.log(r);
		var tradeValue = price*quantity;
		if (isBuy && tradeValue >= r.cash ) {
			delete r["_id"];
			req.status(402).json({err: "NotEnoughDosh", message: `You have ${r.cash}, stock ${price}*${quantity}=${tradeValue}. You are short by ${tradeValue-r.cash}`});
		} else {
			console.log(`${isBuy?"Buying":"Selling"} ${quantity} of ${stock} @ ${price}`);
			var history = Object.assign({}, newHistory);
			history.date = new Date().toJSON();
			history.portfolio =  { value: r.value, cash: r.cash, holdings: r.holdings, rank: r.rank };
			console.log(history);
			r.history.push(history);
			console.log(r);
			if (isBuy) {
				r.value = r.value + tradeValue;
				r.cash = r.cash - tradeValue;
			} else {
				r.value = r.value - tradeValue;
				r.cash = r.cash + tradeValue;
			}

			// var holding = r.holdings.find((h)=>{ return h.stock.id === stock; });
			var holding = r.holdings[stock];
			if (holding == undefined) {
								holding = Object.assign({}, newHolding);
								holding.id = stock;
								holding.name = stockName;
			}
			console.log(holding);
			if (isBuy) {
				holding.quantity = holding.quantity + quantity;
				r.cash = r.cash - tradeValue;
			} else {
				holding.quantity = holding.quantity - quantity;
				r.cash = r.cash + tradeValue;
			}
			console.log(holding);
			r.holdings[stock] = holding;
			console.log(r.holdings);
			console.log("Update db");
			// {holdings: r.holdings, value: r.value, cash: r.cash}
			return db.collection('portfolios').updateOne({id:r.id}, {$set: r})
			.then((result)=>{
				console.log(result);
				db.close();
				delete r["_id"];
				res.status(200).json(r);
			}).catch((err) => {
				console.log(err);
				db.close();
				res.status(500).json(err);
			});
		}
	})
	.catch((err)=>{
		console.log(err);
	});
}