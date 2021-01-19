//import modules
var express = require("express");
var mongoose = require("mongoose");
var bodyparser = require("body-parser");
var cors = require("cors");
var path = require("path");

var app = express();

var route = require('./routes/route');

//connect to mongo db
// mongoose.connect('mongodb://localhost:27017/NSF-Math-Pilot1');
// mongoose.connect('mongodb://localhost:27017/new-study');

// mongoose.connect('mongodb://localhost:27017/microsurgery-study');
// mongoose.connect('mongodb://localhost:27017/nsf-stress-study');


//on connetcion
// mongoose.connection.on('connected', ()=> {
//     console.log("connected to mongo db");
// });

// mongoose.connection.on('error', (err) => {
// if(err)
// {
//     console.log("error in db connection"+ err);
// }
// });


//port number
const port = 3000;

//middleware
app.use(cors());
//body parser
app.use(bodyparser.json());



app.use('/api', route);

//test
app.get('/',(req,res) =>{
    res.send('tested');
});
app.listen(port, () =>{
    console.log("Server started "+ port);
});