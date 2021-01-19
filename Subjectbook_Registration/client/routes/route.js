const express = require('express');
const router = express.Router();
var ObjectId = require('mongoose').Types.ObjectId;
//const Record = require('../models/Record');
var app = express();
var mongoose = require("mongoose");
const dataSchema = require('../models/data');
const Study = require('../models/Study');
const Group = require('../models/Group');
const Subject = require('../models/Subject');
const Explanatory_Variables = require('../models/Explanatory_Variables');
const Session = require('../models/Session');
const Config = require('../models/Config');
const Repeat_Measure = require('../models/Repeat_Measure');
const User = require('../models/User');
var multer = require('multer');
const { json } = require('body-parser');
const fs = require('fs');

//upload data file 
var DIR = '../uploads';

var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, DIR)
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, file.originalname)
  }
})

var upload = app.use(multer({ storage: storage }).any());

router.post('/uploadDataFile',(req,res) =>{

  upload(req, res, function (err) {
    if (err) {
      return res.end("Error while uploading: " + err.toString());
    }
    else
    {

      res.end('File is uploaded!');
    }
 
    
  });
})

//Sign Up
router.post('/signup', (req, res) => {

  //db connection
  var db_path = 'mongodb://localhost:27017/Subjectbook_Users'
  mongoose.connect(db_path);
  mongoose.connection.on('connected', ()=> {
  });

  mongoose.connection.on('error', (err) => {
  if(err)
  {
      console.log("error in db connection"+ err);
      res.send(JSON.stringify('error'));
  }
  });

 // new user registration object
  let newUser = new User({
    userName: req.body.userName,
    email: req.body.email,
    userOrganization: req.body.userOrganization,
    userWebsite: req.body.userWebsite,
    userStudyName: req.body.userStudyName,
    userJobTitle: req.body.userJobTitle,
    userRecommender: req.body.userRecommender,
    userStudyDescription: req.body.userStudyDescription,
    userStudySizeEstimate: req.body.userStudySizeEstimate,
    userStudyVariables: req.body.userStudyVariables,
    role: req.body.role
  });

 
  User.create(newUser, function(err, userres) {
      if (err) 
      {
        mongoose.connection.close()
        console.log("Error in user creation: " + err)
        res.send(JSON.stringify('error'));
      }
      else
      {
        console.log(userres)
        var nodemailer = require('nodemailer');
        var transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: '',
            pass: ''
          }
        });

        var mailOptions = {
          from: '',
          to: '',
          subject: 'New User Registration for Subjectbook',
          text: "Please find the request details below.\n\n" + JSON.stringify(req.body) + "\n\n Thank you!"
        };

        transporter.sendMail(mailOptions, function(error, info){
          if (error) {
            console.log('Email not sent ' + error);
          } else {
            console.log('Email sent: ' + info.response);
          }
        });


        mongoose.connection.close()
        res.send(JSON.stringify('success'));
      }

});


})


//clear study details from DB
router.post('/clearCollections',(req, res, next) =>{

  //DB connection
  var db_path = 'mongodb://localhost:27017/' + req.body.study_name
  mongoose.connect(db_path);
  mongoose.connection.on('connected', ()=> {
  console.log("connected to mongo db" + db_path);
  });

  mongoose.connection.on('error', (err) => {
  if(err)
  {
      console.log("error in db connection"+ err);
      res.send(JSON.stringify('error'));
  }
  });
 

 const isStudyExists = async ()=>{

   const find_study = new Promise ((resolve, reject) =>{
   
     //let study_name = req.body.bucketname;
     Study.find({study_name: req.body.study_name, study_key: req.body.study_key}, function(err, study_result){     
       resolve(study_result)
     })
 
     })
     const study = await find_study;
     return study
   }
 
   isStudyExists().then((study_found) => {
     if(study_found.length > 0) {
       
   Explanatory_Variables.remove(function(err,data){
     if(err)
     {
         res.send(err)
     }
     else{
        // res.json({msg: 'cleared succesfully'})
     }
 })
 Repeat_Measure.remove(function(err,data){
   if(err)
   {
       res.send(err)
   }
   else{
      // res.json({msg: 'cleared succesfully'})
   }
})

 Config.remove(function(err,data){
     if(err)
     {
         res.send(err)
     }
     else{
         //res.json({msg: 'cleared succesfully'})
     }
 })
 Group.remove(function(err,data){
     if(err)
     {
         res.send(err)
     }
     else{
         //res.json({msg: 'cleared succesfully'})
     }
 })
 Session.remove(function(err,data){
     if(err)
     {
         res.send(err)
     }
     else{
         //res.json({msg: 'cleared succesfully'})
     }
 })

 Subject.remove(function(err,data){
     if(err)
     {
         res.send(err)
     }
     else{
       res.send(JSON.stringify('success'));
     }
 })

}
 else
 {
   res.send(JSON.stringify('error'));
 }
})

   
   
});


//create study DB by reading csv files
router.post('/processData', (req,res)=>{
  const csv = require('csv-parser')
  const filestream = require('fs')
  var parse = require('csv-parse');
  var request = require('request');
  var os = require('os');

  var results = []
  var study = []
  var groups = []
  var days = []
  var sessions = []
  var subjects = []
  var explanatory = []
  var video_consents = {}

  var study_id  = ''
  var subject_collection = []
  var repeat_measure_collection = []
  var session_id_collection = []

  var subject_ref_dict = {}
  var repeat_measure_ref_dict = {}
  var session_ref_dict = {}

  //request parameters
  console.log("request " + req.body)
  console.log("exp vars " + JSON.parse(req.body.explanatory_variables))
  var dir_name = '../uploads/'
  var data_file = req.body.study_name + '.csv'
  var type_of_videos = req.body.video_types
  var video_loc_dir = '/static/data/' + req.body.study_name + '/'
  var video_format = req.body.video_format
  var video_consent_file = 'video_consent_' + req.body.study_name + '.csv'

  //DB connection to the study name in the request
  var db_path = 'mongodb://localhost:27017/' + req.body.study_name
  mongoose.connect(db_path);
  mongoose.connection.on('connected', ()=> {
  console.log("connected to mongo db" + db_path);
  });

  mongoose.connection.on('error', (err) => {
  if(err)
  {
      console.log("error in db connection"+ err);
      res.send(JSON.stringify('error'));
  }
  });

  const dataMapper = async ()=>{

    // check if study exists - proceed only if study exists
    const check_study = new Promise ((resolve, reject) =>{
      Study.find({study_name: req.body.study_name, study_key: req.body.study_key}, function(err, study_result){     
        resolve(study_result)
        if (err) throw err; 
      })
    })
  
    // identifying unique subjects from datafile to create subject collection for the study
    const sub_config = new Promise((resolve, reject)=>{
      results = []
      filestream.createReadStream(dir_name + data_file)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => {
          var unique_sub = [...new Set(results.map(item => item.Participant_ID))]; 
          unique_sub = unique_sub.filter(sub => sub);
          subjects.push(unique_sub)
          resolve(subjects)
        })
      })
    
    // identifying days of experiment for creating repeat measure collection 
    const days_config = new Promise((resolve, reject)=>{ 
      results = []   
      filestream.createReadStream(dir_name + data_file)
          .pipe(csv())
          .on('data', (data) => results.push(data))
          .on('end', () => {
            var unique_days = [...new Set(results.map(item => item.Day))];  
            unique_days = unique_days.filter(day => day);
            days.push(unique_days)
            resolve(days)
          })
        })

    // identifying unique sessions from the datafile to create session collection
    const sess_config = new Promise((resolve, reject)=>{      
      results = []
      filestream.createReadStream(dir_name + data_file)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => {
          var unique_sess = [...new Set(results.map(item => item.Treatment))];  
          unique_sess = unique_sess.filter(sess => sess);
          sessions.push(unique_sess)
          resolve(sessions)
        })
      })

      // reading video consent for each subject from video consent file
      const video_consent_config = new Promise((resolve, reject) => {
        video_consent_results = []
        filestream.createReadStream(dir_name + video_consent_file)
        .pipe(csv())
        .on('data', (data) => video_consent_results.push(data))
        .on('end', () => {
          for(result of video_consent_results){
            var participant = result['Participant_ID']
            video_consents[participant] = result['Video_Consent']
            console.log("participant" + participant + "consent" + result['Video_Consent']) 
            resolve(video_consents)
          }
        })
      })
    
    // wait until all data become available 
    var config = {
    'study_config' : await check_study,
    'day_config' : await days_config,
    'session_config' : await sess_config,
    'subject_config' : await sub_config,
    'video_consent' : await video_consent_config
    }
    
    // return to dataMapper
    return config

  }

  dataMapper().then((data) => {
    console.log(data)
    var studyType = req.body.study_type
    //identify study type
    if(data.day_config[0].length > 1)
    {
      studyType = 'PARALLEL_REPEAT'
    }
    
    // update study only if it exists
    if(data.study_config.length > 0)
    {

      study_id = data.study_config[0]._id

   
      setTimeout(function() {

        for (var each_sub of data.subject_config[0]){
          //create subject object
          let newSubject = new Subject ({
            subject_name: each_sub,
            subject_study_id: study_id,
            bad_subject : "",
            good_subject : "1",
            unused : "",
            video_consent : data.video_consent[each_sub]
            // video_consent : "1"
          })

          // create entry for each subject in Subject collection
          Subject.create(newSubject, function(err, subject_res){
            console.log("creating subject")
            if (err) throw err;
            subject_collection.push(subject_res._id)
            subject_ref_dict[subject_res._id] = subject_res.subject_name;

          })

        }

      }, 1000);

      setTimeout(function(){

        for (day of data.day_config[0]){
          // create repeat measure object
          let newRepeatMeasure = new Repeat_Measure({
            repeat_measure_name: day,
            repeat_measure_study_id: study_id
          })

          // create repeat measure entry in Repeat_Measure collection
          Repeat_Measure.create(newRepeatMeasure, function(err, repeat_measure_res){
            if(err) throw err;
            repeat_measure_collection.push(repeat_measure_res._id)
            repeat_measure_ref_dict[repeat_measure_res._id] = repeat_measure_res.repeat_measure_name;
          })
        }
        
      }, 1000);

      setTimeout(function(){
        
        //creating session objects
        for (var each_session of data.session_config[0]){
          // console.log("Session "+ each_session)
          let newSession = new Session({
            session_name : each_session,
            session_study_id: study_id,
            //session_type: each_session[1]
            session_type: "" 
          })
  
          //creating session record in Session collection
          Session.create(newSession, function(err, session_res){
            console.log("creating session")
            if (err) throw err;
            session_id_collection.push(session_res._id)
            session_ref_dict[session_res._id] = session_res.session_name;
  
          })
  
        }

      }, 1000);
    
    // construct data for each explanatory variable
    var full_data = function(subject_name, repeat_measure_name, session_name, explanatory_variable_names) {
      results = []

      return new Promise((resolve, reject)=>{ 
        console.log("creating full data ")
        res_data = {}
        sum_of_values = {}

        for(explanatory_variable_name of explanatory_variable_names)
        {
          sum_of_values[explanatory_variable_name] = 0
        }
        
        full_data_collection = []  
        // use an incremented treatment time variable if the data file doesn't have treatment time explicitly
        treatment_time = 0 

        filestream.createReadStream(dir_name + data_file)
          // filestream.createReadStream('C:/Users/janaa/OneDrive/Desktop/Sem3/SubjectBook/sample.csv')
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', () => {
              for(result of results)
              {
                // only if participant ID, day, session and explanatory variable match
                if(result['Participant_ID'] == subject_name && result['Day'] == repeat_measure_name && result['Treatment'] == session_name)
                {                   
                  // console.log("full data")        
                  res_data['Time'] = parseInt(result['TreatmentTime'])
                  res_data['VideoTime'] = parseInt(result['VideoTime'])

                  for(explanatory_variable_name of explanatory_variable_names)
                    {
                      if(!isNaN(parseFloat(result[explanatory_variable_names[0]])))  
                      {
                      res_data[explanatory_variable_name] = parseFloat(result[explanatory_variable_name])
                      //keeping track of sum of values to calculate mean
                      sum_of_values[explanatory_variable_name] = sum_of_values[explanatory_variable_name] + res_data[explanatory_variable_name]
                      //temporarily set mean value for exp. variable to the current sum, until final mean is calculated
                      res_data['Mean ' + explanatory_variable_name] = sum_of_values[explanatory_variable_name]
                      }
                      else // NaN for missing data
                      {
                        res_data[explanatory_variable_name] = NaN
                      }
                    }

                  full_data_collection.push(res_data)
                  // console.log(treatment_time)
                  treatment_time = treatment_time + 1
                  
                  res_data = {}
                }
              }
              
              resolve(full_data_collection)
              res_data = {}
              sum_of_values = {}
              data = {}
              full_data_collection = []
              // results = []
            })
      })
    }

    // calculate mean for the explanatory variable values
    var full_data_mean = function(full_data_values_no_mean, explanatory_variables){

      for(explanatory_variable of explanatory_variables){

        console.log("full data mean len " + full_data_values_no_mean.length)
        full_data_sum = full_data_values_no_mean[full_data_values_no_mean.length - 1]
        full_data_sum = full_data_sum['Mean '+ explanatory_variable]
        console.log("full data mean " + full_data_sum)
        mean = full_data_sum / full_data_values_no_mean.length
        // update mean for each data point
        full_data_values_no_mean.forEach(d => d["Mean " + explanatory_variable] = mean)

      }
      
      return full_data_values_no_mean
    }

    setTimeout(async()=>{

      explanatory_variables = JSON.parse(req.body.explanatory_variables)
      complete_data = []
      console.log("explanatory_variables " +JSON.parse(req.body.explanatory_variables))

      // iterate through available subjects, repeat measures, sessions and explanatory variables to create records 
      // in Explanatory_Variables collection
      for(subject_id of subject_collection)
      {
        console.log("Sub id" + subject_id)
        for(repeat_measure_id of repeat_measure_collection)
        {
          console.log("RM id" + repeat_measure_id)
          for(session_id of session_id_collection)
          {
            console.log("Session id" + session_id)

            for(explanatory_variable of explanatory_variables)
            {
              console.log("Exp var id" + explanatory_variable[0])
              subject = subject_ref_dict[subject_id]
              repeat_measure = repeat_measure_ref_dict[repeat_measure_id]
              session =  session_ref_dict[session_id]

              // console.log("exp var fetching")
              // get full data without mean calculate
              full_data_values_no_mean = await full_data(subject, repeat_measure, session, explanatory_variable)
              
              if(full_data_values_no_mean.length > 0)
              {
                video_array = []
                y_axis_names = []
                explanatory_variable_name = explanatory_variable[0]
                explanatory_variable.forEach(exp_var => {                  
                  y_axis_names.push(exp_var)                  
                })

                y_axis_names.push("Mean " + explanatory_variable[0])

                // full data with calculated mean value added
                full_data_with_mean = await full_data_mean(full_data_values_no_mean, explanatory_variable)
                
                // create video URLs with the type of videos obtained from user
                type_of_videos.forEach(video_type => {
                  video_array.push(video_loc_dir + 'Group1_' + subject + '_' + repeat_measure + '_' + session + '_' + video_type + video_format)
                });

                // explanatory variable object
                let newExp = new Explanatory_Variables({
                  explanatory_subject_id: subject_id,
                  explanatory_study_id: study_id,
                  explanatory_repeat_measure_id: repeat_measure_id,
                  explanatory_session_id: session_id,
                  explanatory_variable_name: explanatory_variable_name,
                  explanatory_variable_type: "Primary",
                  explanatory_graph_type: "Signal",
                  explanatory_x_axis_name: "Time",
                  explanatory_y_axis_name: y_axis_names,
                  full_data: full_data_with_mean,
                  video_url: video_array
                })
  
                // create explanatory variable record in Explanatory_Variables collection
                var exp_var_data = await new Promise((resolve, reject) => {
                  
                    Explanatory_Variables.create(newExp, function(err, exp_res) {
  
                      full_data_with_mean = []
                      full_data_values_no_mean = []
                      if (err) throw err;
                      // console.log(exp_res)
                      resolve(exp_res)
                    })                 
                  
                })

                complete_data.push(exp_var_data)
                
              }
            }
          }
        }
      }
      
      mongoose.connection.close()
      // return success upon successful update in study database
      return res.json(JSON.stringify('success'))


    }, 10000);

      
    } // if study found

    else
    {
      mongoose.connection.close()
      // return error upon failure to update in study database
      return res.json(JSON.stringify('error'))
    }
  }) //end data mapper then

})

// get subject data
router.get('/getData/:id',(req, res, next )=>{
    let sub_id = req.params.id
    console.log(sub_id)
   
    Explanatory_Variables.find({explanatory_subject_id: req.params.id}, function(err, data) {
        if(err){
            res.send(err)
            //console.log(err)
          }
          else{
           console.log(data)
           res.send(data)
          }
    })
});

// create study DB from config files (AWS)
router.get('/processDataFromConfig',(req, res, next )=>{
  //variables
  const csv = require('csv-parser')
  const fs = require('fs')
  const filestream = require('fs')
  var parse = require('csv-parse');
  var request = require('request');
  var os = require('os');

  var results = []  
  var subject_array = []
  var unique_subject_array = []
  var session_array = []
  var video_url_array = []
  //var full_data_array = []
  var full_data_PP = []
  var full_data_EDA = []
  var full_data_BR = []
  var full_data_Chest = []
  var full_data_Wrist = []  
  var PP_mean = null
  var EDA_mean = null
  var BR_mean = null 
  var Chest_mean = null
  var Wrist_mean = null
  var final_data_wrist = []
  //var exp_dict = {}
  var full_data_dict = {}
  var sub_id = ""
  var index = []

  async function delay() {

    return new Promise(resolve => setTimeout(resolve, 10000));
  }
  
  async function getSubjectID(subjectName){

    //var sub_id= '';
    const sub_promise = new Promise((resolve, reject) => {
    Subject.find({$and:[{subject_name: subjectName}]}, ["_id", "subject_group_id"], function(err, subID_result){
      var sub_id_group_id = [subID_result[0]._id,subID_result[0].subject_group_id]
      resolve(sub_id_group_id)
 
    })
   
  })

  const stat = await sub_promise
  return stat

  }

  async function SetGroupName(groupName, subName){
    const group_collection_promise = new Promise((resolve, reject) => {
      Group.find({$and:[{group_name: groupName}]}, ["_id"], function(err, group_result){
        groupID = group_result[0]._id
        // console.log(groupID)
        resolve(groupID)
  
      })
    })
    const group_result = await group_collection_promise
    const subject_update_promise = new Promise((resolve, reject) => {
    Subject.updateOne({subject_name:subName},{$set:{subject_group_id:group_result}},function(err, result){
      if(err)
      {
        console.log("subject group update error")
      }
      else
      {
        resolve(result)
      }
    })
  })
    const subject_update = await subject_update_promise
    return subject_update
    // console.log(group_result)
   }
   async function GetGroupName(subName){
    const group_promise = new Promise((resolve, reject) => {
    group_results = []
    fs.createReadStream('C:/apps/SB_Mongo/PhysiologicalData.csv')
    .pipe(csv())
    .on('data', (data) => group_results.push(data))
    .on('end', () => {
      // const group_promise = new Promise((resolve, reject) => {
        for(var exp of group_results)
        {
          if(exp.Participant_ID == subName)
          {
            console.log("group found" + exp.Group)
            resolve(exp.Group)
            break
          }
        }
      
    })
    })
    const stat = await group_promise
    return stat
  }

  async function getStudyName(setGroupNameStat){
    const study_promise = new Promise((resolve, reject) => {
      Study.find({$and:[{}]}, ["study_name"], function(err, studyName_result){
        studyName = studyName_result[0].study_name
        resolve(studyName)
  
      })
    })

  const stat = await study_promise
   return stat
  }


  async function getExplanatory(){
  //get sessions array
  const sess_promise = new Promise((resolve, reject) => {
    Session.find({}, ["session_name", "_id"], function(err, session_result){
      session_array = session_result
      resolve(session_array)
  })
    
    }) 
  
  //get subjects array
   const subjectPromise = new Promise((resolve,reject) =>{
      Subject.find({},["subject_name", "_id", "video_consent"],function(err, sub_result){
        subject_array = sub_result
        console.log("subject name" + subject_array[0].subject_name)
        resolve(subject_array)
      })
    }) //end subject promise
   let status = await subjectPromise
   return status
  }// end async getExplanatory

//creatExplanatoryCalls
   const createExplanatoryCalls=(stat) = async _ => {
   //console.log("create exp")
      const exp = await getExplanatory()
      for(const subject of subject_array){  
        if(unique_subject_array.includes(subject.subject_name)){
          
          for(const session of session_array){  
            //console.log("sess name " +session.session_name) 
            console.log("sub name " + subject.subject_name) 
            console.log("sub consent " + subject.video_consent) 
            
            var groupName_stat = await GetGroupName(subject.subject_name)
            var group_name_update_stat = await SetGroupName(groupName_stat, subject.subject_name )
            var studyName_stat = await getStudyName(group_name_update_stat)
            // var studyName_stat = await getStudyName()
            //console.log("stat" + stat)
            let expObj = await createExplanatoryObject(session.session_name,session._id, subject, groupName_stat, studyName_stat)
            //console.log("done creating")

         }
        }
        else
        {
            //delete subject promise
            const subjectPromise = new Promise((resolve,reject) =>{
            Subject.remove({subject_name: subject.subject_name},[],function(err, sub_result){            
            console.log("subject removed ")
            resolve(sub_result)
            })
            }) //end delete subject promise
        }

      }   



  } //creatExplanatoryCalls end

//assign video consent values to subjects
async function assign_video_consent()
{
  var results = []
  return video_consent_promise = new Promise((resolve, reject)=>{        
    filestream.createReadStream('C:/apps/SB_Mongo/IndexFile-AnciliaryMedia-Detailed.csv')
    .pipe(parse({delimiter: ','}))
    .on('data', (data) =>  results.push(data))
    .on('end', () => {
      for(var result of results)
      {
        Subject.updateOne({subject_name:result[0]},{$set:{video_consent:result[9]}},function(err, result){
          if(err)
          {
            console.log("video consent update error")
          }
        })
          index.push(result)
        if(result[0]== "T180")
        {
          resolve(index)
          break;
        }
      }
      
      //console.log("from index T003 consent: " +index[1][9]) 
      
      
      results = []
     
    })
  })
}// end assign video consent method

async function getData()
{
  var video_consent_stat = await assign_video_consent()
  createExplanatoryCalls(video_consent_stat)
}
  //get results from physiological file
    fs.createReadStream('C:/apps/SB_Mongo/PhysiologicalData.csv')
    //fs.createReadStream('C:/apps/SB_Mongo/SampleData.csv')
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', () => {

     const unique_subjects = [...new Set(results.map(item => item.Participant_ID))];     
     unique_subject_array =  String(unique_subjects).split(",")
     console.log("unique subjs :" + unique_subject_array)
     getData()

    })

     const get_subject_data = (sessionName, subjectName) => {     
                    console.log("subject: " + subjectName)
                    console.log("session " + sessionName)
                    
                    full_data_dict = {}
                    full_data_PP = []
                    PP_mean = 0.0
                    full_data_EDA = []
                    EDA_mean = 0.0
                    full_data_BR = []
                    BR_mean = 0.0
                    full_data_Chest = []
                    Chest_mean = 0.0
                    full_data_Wrist = []                     
                    Wrist_mean = 0.0
                    final_data = []
      return new Promise((resolve, reject)=>{
       
        for(var exp of results)
                  {
                  // console.log("subject: " + exp.Participant_ID)
                    //console.log("session " + exp.Treatment)
                    if(exp.Participant_ID == subjectName && exp.Treatment == sessionName)
                    {
                      full_data_dict["Time"] = parseFloat(exp.Treatment_Time)                       
                      full_data_dict["Perspiration"] = parseFloat(exp.PP_QC)*100
                      full_data_dict["Mean PP"] = 0.0
                      full_data_dict["VideoTime"] = parseFloat(exp.Video_Time)
                      
                      if(isNaN(parseFloat(exp.PP_QC)) == false) 
                      { 
                        full_data_PP.push(full_data_dict);                       
                        PP_mean = PP_mean + (parseFloat(exp.PP_QC) *100)
                      }
                      
                      full_data_dict = {}        

                      full_data_dict["Time"] = parseFloat(exp.Treatment_Time)                       
                      full_data_dict["EDA"] = parseFloat(exp.EDA_QC)
                      full_data_dict["Mean EDA"] = 0.0
                      full_data_dict["VideoTime"] = parseFloat(exp.Video_Time)
                      
                      if(isNaN(parseFloat(exp.EDA_QC)) == false)
                      {
                        full_data_EDA.push(full_data_dict);
                        EDA_mean = EDA_mean + parseFloat(exp.EDA_QC) 
                      }
                      
                      full_data_dict = {}

                      full_data_dict["Time"] = parseFloat(exp.Treatment_Time)                       
                      full_data_dict["BR"] = parseFloat(exp.BR_QC)
                      full_data_dict["Mean BR"] = 0.0
                      full_data_dict["VideoTime"] = parseFloat(exp.Video_Time)
                      
                      if(isNaN(parseFloat(exp.BR_QC)) == false)
                      {
                        full_data_BR.push(full_data_dict);
                        BR_mean = BR_mean + parseFloat(exp.BR_QC)
                      }
                      
                      full_data_dict = {}

                      full_data_dict["Time"] = parseFloat(exp.Treatment_Time)
                      full_data_dict["Chest"] = parseFloat(exp.Chest_HR_QC)
                      full_data_dict["Mean Chest"] = 0.0
                      full_data_dict["VideoTime"] = parseFloat(exp.Video_Time)
                      
                      if(isNaN(parseFloat(exp.Chest_HR_QC)) == false)
                      {
                        full_data_Chest.push(full_data_dict);
                        Chest_mean = Chest_mean + parseFloat(exp.Chest_HR_QC)
                      }
                      
                      full_data_dict = {}

                      full_data_dict["Time"] = parseFloat(exp.Treatment_Time)                       
                      full_data_dict["Wrist"] = parseFloat(exp.Wrist_HR_QC)
                      full_data_dict["Mean Wrist"] = 0.0
                      full_data_dict["VideoTime"] = parseFloat(exp.Video_Time)
                      
                      if(isNaN(parseFloat(exp.Wrist_HR_QC)) == false)
                      {
                        full_data_Wrist.push(full_data_dict)
                        Wrist_mean = Wrist_mean + parseFloat(exp.Wrist_HR_QC)
                      }
                      
                      full_data_dict = {}

                    }
       

                  }
                   var delay_stat =  delay();
                   if(PP_mean > 0.0)
                   {
                    PP_mean = PP_mean/full_data_PP.length
                    //console.log("PP mean " + PP_mean/full_data_PP.length)
                    full_data_PP.forEach(d => d["Mean PP"] = PP_mean)
                    console.log("PP mean "+ PP_mean)
                   }
                   
                   if(EDA_mean > 0.0) 
                   {
                    EDA_mean = EDA_mean/full_data_EDA.length  
                   full_data_EDA.forEach(d => d["Mean EDA"] = EDA_mean)
                   console.log("meanEDA "+ EDA_mean/full_data_EDA.length)
                   }
                   
                   if(BR_mean > 0.0)
                   {
                    BR_mean = BR_mean/full_data_BR.length
                    full_data_BR.forEach(d => d["Mean BR"] = BR_mean)
                    console.log("mean BR" + BR_mean/full_data_BR.length)
                   }
                   
                   if(Chest_mean > 0.0)
                   {
                   Chest_mean = Chest_mean/full_data_Chest.length
                   full_data_Chest.forEach(d => d["Mean Chest"] = Chest_mean)
                   console.log("mean chest" + Chest_mean)
                   }
                   
                   if(Wrist_mean > 0)
                   {
                   Wrist_mean = Wrist_mean/full_data_Wrist.length                
                   full_data_Wrist.forEach(d => d["Mean Wrist"] = Wrist_mean)
                   console.log("mean wrist "+ Wrist_mean)
                   resolve(final_data_wrist.push(full_data_Wrist))
                   }
                   else
                   {
                     resolve(final_data.push(full_data_PP, full_data_Wrist,full_data_EDA, full_data_BR, full_data_Chest))
                   }

                 
                })


        }// end get subject data




    const createExplanatoryObject = (sessionName, sessionId, subject, groupName, studyName) =>{
        console.log("session :"+sessionName +"Subject "+ subject.subject_name +"consent" + subject.video_consent+ " groupName: " + groupName + " studyName "+ studyName)   
        
        var video_url_array = []

        if(subject.video_consent == "1")
        {          
          var video_url = "/static/data/clipped_videos"
          video_url = video_url + "/" + studyName
          var face_video_url = video_url + "/" + groupName +"_" + subject.subject_name + "_SuperSession_face_" + sessionName + ".mp4"
          var thermal_video_url = video_url + "/" + groupName +"_" + subject.subject_name + "_SuperSession_operational_" + sessionName + ".mp4"
          var screencapture_video_url = video_url + "/" + groupName +"_" + subject.subject_name + "_SuperSession_screencapture_" + sessionName + ".mp4"
          video_url_array.push(face_video_url, thermal_video_url, screencapture_video_url)
        }
        else if(subject.video_consent == "0")
        {
          video_url_array.push("/static/data/clipped_videos/non_consentvideo.mp4")
        }

          return get_subject_data(sessionName, subject.subject_name).then((tdata)=> {

            const exp_var = new Promise((resolve, reject)=>{
              let newExp_PP = new Explanatory_Variables ({
                explanatory_subject_id: subject._id,
                explanatory_session_id: sessionId,
                explanatory_variable_name: "Perspiration",                
                explanatory_variable_type: "Primary",               
                explanatory_graph_type: "Signal",
                explanatory_x_axis_name: "Time",
                video_url: video_url_array,
                explanatory_y_axis_name: ["Perspiration", "Mean PP"], 
                explanatory_video_col_name: "VideoTime",
                //explanatory_y_axis_name: ["Perinasal Perspiration", "VideoTime"],                       
                full_data: full_data_PP
                  })
                  if(full_data_PP.length > 0)
                  {
                    Explanatory_Variables.create(newExp_PP, function(err, newExp_res){
                      if(err){
                          console.log(err)
                      }
                      else{
                        //resolve(newExp_res)
                        console.log("created PP")
                      }
                      })
                  }
                 
              // delay();
              let newExp_EDA = new Explanatory_Variables ({
                explanatory_subject_id: subject._id,
                explanatory_session_id: sessionId,                
                explanatory_variable_name: "EDA",
               explanatory_variable_type: "Secondary",
                explanatory_graph_type: "Signal",
                explanatory_x_axis_name: "Time",
                video_url: video_url_array,
                explanatory_y_axis_name: ["EDA", "Mean EDA"],
                explanatory_video_col_name: "VideoTime",
                //explanatory_y_axis_name: ["EDA", "VideoTime"],
                full_data: full_data_EDA
                  })
                if(full_data_EDA.length > 0)
                {
                  Explanatory_Variables.create(newExp_EDA, function(err, newExp_res){
                    if(err){
                        console.log(err)
                    }
                    else{
                      //resolve(newExp_res)
                      console.log("created EDA")
                    }
                  })
                }
                
                
                 //delay();
                let newExp_BR = new Explanatory_Variables ({
                explanatory_subject_id: subject._id,
                explanatory_session_id: sessionId,                
                explanatory_variable_name: "BR",
                explanatory_variable_type: "Secondary",
                explanatory_graph_type: "Signal",
                explanatory_x_axis_name: "Time",
                video_url: video_url_array,
                explanatory_y_axis_name: ["BR", "Mean BR"],
                explanatory_video_col_name: "VideoTime",
               // explanatory_y_axis_name: ["BR",  "VideoTime"],
                full_data: full_data_BR
                  })
                if(full_data_BR.length > 0)
                {
                  Explanatory_Variables.create(newExp_BR, function(err, newExp_res){
                    if(err){
                        console.log(err)
                    }
                    else{
                      //resolve(newExp_res)
                      console.log("created BR")
                    }
                  }) 
                }
                               
                 //delay();
                  let newExp_Chest = new Explanatory_Variables ({
                    explanatory_subject_id: subject._id,
                    explanatory_session_id: sessionId,                
                    explanatory_variable_name: "Chest HR",
                    explanatory_variable_type: "Secondary",
                    explanatory_graph_type: "Signal",
                    explanatory_x_axis_name: "Time",
                    video_url: video_url_array,
                    explanatory_y_axis_name: ["Chest", "Mean Chest"],
                    explanatory_video_col_name: "VideoTime",
                    //explanatory_y_axis_name: ["Chest",  "VideoTime"],
                    full_data: full_data_Chest
                      })
                    
                    if(full_data_Chest.length > 0)
                    {
                      Explanatory_Variables.create(newExp_Chest, function(err, newExp_res){
                        if(err){
                            console.log(err)
                        }
                        else{
                          //resolve(newExp_res)
                          console.log("created Chest data")
                        }
                      })
                    }
                    
                    // delay();
                      let newExp_Wrist = new Explanatory_Variables ({
                        explanatory_subject_id: subject._id,
                        explanatory_session_id: sessionId,                
                        explanatory_variable_name: "Wrist HR",
                        explanatory_variable_type: "Secondary",
                        explanatory_graph_type: "Signal",
                        explanatory_x_axis_name: "Time",
                        video_url: video_url_array,
                        explanatory_y_axis_name: ["Wrist", "Mean Wrist"],
                        explanatory_video_col_name: "VideoTime",
                        //explanatory_y_axis_name: ["Wrist",  "VideoTime"],
                        full_data: full_data_Wrist
                          })
                        if(full_data_Wrist.length > 0)
                        {
                          Explanatory_Variables.create(newExp_Wrist, function(err, newExp_res){
                            if(err){
                                resolve(newExp_res) // remove
                                console.log(err)
                            }
                            else{
                              resolve(newExp_res)
                              console.log("created Wrist data")                            
                            }
                          }) 
                        }
                        else{
                          resolve(newExp_res)// remove
                        }

          }) // end promise exp_var
          
   }) 

   
// then subjectData()
   
    } // end createExplanatoryObject()
  

  
})// end test method

// get CSV data for subject ID 
router.get('/getCSVData/:subjectID',(req, res, next )=>{
    
    const csv = require('csv-parser')
    const fs = require('fs')
    const results = []   
    var full_data_array = []
    var full_data_PP = []
    var full_data_EDA = []
    var full_data_BR = []
    var full_data_Chest = []
    var full_data_Wrist = [] 
    var exp_dict = {}
    let participantID = req.params.subjectID
    var subject_ID = ""
    var session_ID = ""

    Subject.find( {},function(err, sub_result){
      if(sub_result.length>0){       
        for(subject in sub_result){          
          var participantID = sub_result[subject].subject_name          
          var subject_ID = sub_result[subject]._id
          
        }
      }
    })

    Subject.find({$and:[{subject_name: participantID}]}, function(err, sub_result){
      if(sub_result.length>0){
        subject_ID = sub_result[0]._id
      }
    })
    async function get_session_id(){
      const session_id = new Promise((resolve, reject)=>{
        Session.find({$and:[{session_name: "SuperSession"}]}, function(err, sub_result){
          if(sub_result.length>0){
            session_ID = String(sub_result[0]._id) 
            resolve(session_ID)
          }
        })
      })
      let session_id_status = await session_id
      return session_id_status
    }
    async function get_subject_data(){     

      var full_data_dict = {}
      const full_data_promise = new Promise((resolve, reject)=>{
        for(var exp of results)
                  {
                    if(exp.Participant_ID == participantID)
                    {
                      full_data_dict["Time"] = parseFloat(exp.Video_Time)                       
                      full_data_dict["Perinasal Perspiration"] = parseFloat(exp.PP_QC)
                      full_data_PP.push(full_data_dict);
                      full_data_dict = {}        

                      full_data_dict["Time"] = parseFloat(exp.Video_Time)                       
                      full_data_dict["EDA"] = parseFloat(exp.EDA_QC)
                      full_data_EDA.push(full_data_dict);
                      full_data_dict = {}

                      full_data_dict["Time"] = parseFloat(exp.Video_Time)                       
                      full_data_dict["BR"] = parseFloat(exp.BR_QC)
                      full_data_BR.push(full_data_dict);
                      full_data_dict = {}

                      full_data_dict["Time"] = parseFloat(exp.Video_Time)
                      if(isNaN(exp.Chest_HR_QC)){
                        full_data_dict["Chest"] = parseInt(0)
                      }                      
                      else{
                        full_data_dict["Chest"] = parseFloat(exp.Chest_HR_QC)
                      }
                      full_data_Chest.push(full_data_dict);
                      full_data_dict = {}

                      full_data_dict["Time"] = parseFloat(exp.Video_Time)                       
                      if(isNaN(exp.Wrist_HR_QC)){
                        full_data_dict["Wrist"] = parseFloat(0)
                      }                      
                      else{
                        //console.log("wrist not null")
                        full_data_dict["Wrist"] = parseFloat(exp.Wrist_HR_QC)
                      }
                      full_data_Wrist.push(full_data_dict);
                      full_data_dict = {}

                    }
       
                  }
                  resolve(full_data_Wrist)
                })

                let full_data_status = await full_data_promise

                return full_data_status
        }
   
    //physiological data
    fs.createReadStream('C:/apps/SB_Mongo/PhysiologicalData.csv')
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => {
        
        get_session_id().then((t)=>{
          console.log("session id:" +t)
          get_subject_data().then((tdata)=> {
            const exp_var = new Promise((resolve, reject)=>{
              let newExp_PP = new Explanatory_Variables ({
                explanatory_subject_id: subject_ID,
                explanatory_session_id: session_ID,
                explanatory_variable_name: "Perinasal Perspiration",                
               explanatory_variable_type: "Primary",               
                explanatory_graph_type: "Signal",
                explanatory_x_axis_name: "Time",
                video_url: [],
                explanatory_y_axis_name: ["Perinasal Perspiration"],               
                full_data: full_data_PP
                  })
                  Explanatory_Variables.create(newExp_PP, function(err, newExp_res){
                  if(err){
                      console.log(err)
                  }
                  else{
                    console.log("created PP")
                  }
              
              let newExp_EDA = new Explanatory_Variables ({
                explanatory_subject_id: subject_ID,
                explanatory_session_id: session_ID,                
                explanatory_variable_name: "EDA",
               explanatory_variable_type: "Secondary",
                explanatory_graph_type: "Signal",
                explanatory_x_axis_name: "Time",
                video_url: [],
                explanatory_y_axis_name: ["EDA"],
                full_data: full_data_EDA
                  })
                Explanatory_Variables.create(newExp_EDA, function(err, newExp_res){
                  if(err){
                      console.log(err)
                  }
                  else{
                    console.log("created EDA")
                  }
                })
                

                let newExp_BR = new Explanatory_Variables ({
                explanatory_subject_id: subject_ID,
                explanatory_session_id: session_ID,                
                explanatory_variable_name: "BR",
                explanatory_variable_type: "Secondary",
                explanatory_graph_type: "Signal",
                explanatory_x_axis_name: "Time",
                video_url: [],
                explanatory_y_axis_name: ["BR"],
                full_data: full_data_BR
                  })
                Explanatory_Variables.create(newExp_BR, function(err, newExp_res){
                  if(err){
                      console.log(err)
                  }
                  else{
                    console.log("created BR")
                  }
                })

                  let newExp_Chest = new Explanatory_Variables ({
                    explanatory_subject_id: subject_ID,
                    explanatory_session_id: session_ID,                
                    explanatory_variable_name: "Chest HR",
                    explanatory_variable_type: "Secondary",
                    explanatory_graph_type: "Signal",
                    explanatory_x_axis_name: "Time",
                    video_url: [],
                    explanatory_y_axis_name: ["Chest"],
                    full_data: full_data_Chest
                      })
                    Explanatory_Variables.create(newExp_Chest, function(err, newExp_res){
                      if(err){
                          console.log(err)
                      }
                      else{
                        console.log("created Chest data")
                      }
                    })

                      let newExp_Wrist = new Explanatory_Variables ({
                        explanatory_subject_id: subject_ID,
                        explanatory_session_id: session_ID,                
                        explanatory_variable_name: "Wrist HR",
                        explanatory_variable_type: "Secondary",
                        explanatory_graph_type: "Signal",
                        explanatory_x_axis_name: "Time",
                        video_url: [],
                        explanatory_y_axis_name: ["Wrist"],
                        full_data: full_data_Wrist
                          })
                        Explanatory_Variables.create(newExp_Wrist, function(err, newExp_res){
                          if(err){
                              console.log(err)
                          }
                          else{
                            console.log("created Wrist data")
                          }
                        }) 
                
               
            res.json(JSON.stringify(full_data_Wrist))
            
           
          })

          

    })  
   })   
  })
 })
})

// get object to store
router.post('/object',(req, res, next) =>{
    let newObject = new dataSchema({
    subjectName: req.body.subjectName,
    treatmentTime: req.body.treatmentTime,
    PP_QC: req.body.PP_QC        
    });
    //res.json(next);

    newObject.save((err, data) => {
        if(err)
        {
            res.json({msg: 'Failed '});
        }
        else{
            res.json({msg: 'added succesfully'})
        }
    })
});

// check if study exists
router.post('/findStudy',(req, res, next) =>{

  var db = 'mongodb://localhost:27017/' + req.body.study_name
  mongoose.connect(db);
  mongoose.connection.on('connected', ()=> {
  console.log("connected to mongo db" + db);
  });

  mongoose.connection.on('error', (err) => {
  if(err)
  {
      console.log("error in db connection"+ err);
  }
  });
  const isStudyExists = async ()=>{

  const find_study = new Promise ((resolve, reject) =>{
	
    //let study_name = req.body.bucketname;
    Study.find({study_name: req.body.study_name, study_key: req.body.study_key}, function(err, study_result){     
      resolve(study_result)
    })

    })
    const study = await find_study;
    return study
  }

  isStudyExists().then((study_found) => {
    if(study_found.length > 0) {
      res.json({msg: 'study found'})
      mongoose.connection.close()
    }
    else
    {
      res.json({msg: 'study not found'})
      mongoose.connection.close()
    }
  })

})

//process S3 objects
router.post('/processS3', (req,res)=>{
    const csv = require('csv-parser')
    const filestream = require('fs')
    var parse = require('csv-parse');
    var request = require('request');
    var os = require('os');

    var results = []
    var directory_config=[]
    var study_protocol=[]
    var config=[]
    var group_config=[]
    var session_config=[]
    var explanatory = []

    const s3mapper = async ()=>{

        const check_study = new Promise ((resolve, reject) =>{
	
            //let study_name = req.body.bucketname;
            Study.find({study_name: req.body.study_name}, function(err, study_result){     
              resolve(study_result)
            })
     
          })

    // dir config
    const dir_conf = new Promise((resolve, reject)=>{        
        filestream.createReadStream('C:/apps/SB_Mongo/directory_config.csv')
        .pipe(parse({delimiter: ','}))
        .on('data', (data) =>  results.push(data))
        .on('end', () => {
          for(var result of results)
          {
             // console.log(result) 
              directory_config.push(result)
          }
          resolve(directory_config)
          results = []
         //console.log("Directory Config" + directory_config[2][1] )
        })
      })


      //study protocol
      const stdy_prtcl = new Promise((resolve, reject)=>{
        filestream.createReadStream('C:/apps/SB_Mongo/study_protocol.csv')
        .pipe(parse({delimiter: ','}))
            .on('data', (data) => {
              study_protocol.push(data)
            }).on("end", function(){
              resolve(study_protocol)
              //console.log("protocol" + typeof(study_protocol[0][1]) + study_protocol[0][1])
         });
      })


      //group config

      // const grp_config = new Promise((resolve, reject)=>{
      //   results = []
      //   filestream.createReadStream('C:/apps/SB_Mongo/group_config.csv')
      //   .pipe(parse({delimiter: '\r\n'}))
      //   .on('data', (data) => {
      //     group_config.push(data[0])
      //   }).on("end", function(){
      //     resolve(group_config)
      //     //console.log("group_config"+ typeof(group_config[0]))
      //    });
      // })
      const grp_config = new Promise((resolve, reject)=>{    
        filestream.createReadStream('C:/apps/SB_Mongo/PhysiologicalData.csv')
          //fs.createReadStream('C:/Users/User/ForSubjectBook/SB_Mongo/SampleData.csv')
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', () => {
              //get sessions
              const unique_groups = [...new Set(results.map(item => item.Group))];  
              console.log(typeof(unique_groups))
              group_config.push(unique_groups)
              resolve(group_config)
              console.log("Group config" +group_config)
            })// on file read end
          })

      const sess_config = new Promise((resolve, reject)=>{    
        filestream.createReadStream('C:/apps/SB_Mongo/PhysiologicalData.csv')
          //fs.createReadStream('C:/Users/User/ForSubjectBook/SB_Mongo/SampleData.csv')
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', () => {
             //get sessions
             const unique_sessions = [...new Set(results.map(item => item.Treatment))];  
             session_config.push(unique_sessions)
             resolve(session_config)
             console.log("Session config" +session_config)
            })// on file read end
          })

      //session info
      /*const sess_config = new Promise((resolve, reject)=>{
      filestream.createReadStream('C:/Users/User/ForSubjectBook/SB_Mongo/session_info.csv')
      .pipe(parse({delimiter: ','}))
            .on('data', (data) => {
              session_config.push(data)
            }).on("end", function(){
              resolve(session_config)
              //console.log("Session config" +session_config[0][1])
         });
      })*/

      var config_dict = {}
      var line_arr = []
      var lineReader = require('readline').createInterface({
        input: require('fs').createReadStream('C:/apps/SB_Mongo/config.csv')
      });
      
      const conf = new Promise((resolve, reject)=>{
      lineReader.on('line', function (line) {
        line_arr = line.split(',')
        //console.log("line arr: "+line_arr)
        var i = 0
        for (var item in line_arr){
          config_dict[i] = line_arr[item]
          i++;
        }
        console.log(config_dict)
        config.push(config_dict)        
        config_dict= {}    

      })        
        resolve(config)
        //console.log("config 1 "+config[0][0])
      });
 

      //explanatory
      const explanatory_conf = new Promise((resolve, reject)=>{
        filestream.createReadStream('C:/apps/SB_Mongo/explanatory.csv')
            .on('data', (data) => {
              explanatory.push(data)
            }).on("end", function(){
              resolve(explanatory)
             // console.log("explanatory: "+ explanatory)
         });
      })

      let study = await check_study;
       if(study.length == 0){      
           console.log("study length 0")   
         let dc = await dir_conf; // type of exp  (Janaat)
         let sd = await stdy_prtcl; //study_protocol.csv
         let gc = await grp_config; // all groups will be listed
         let sc = await sess_config; // "Order.csv" has session info
         let c = await conf; 
         let e = await explanatory_conf; // for create study purpose

         var response = {
           "status": "New",
           "directory_config": dc,
           "study_protocol": sd,
           "group_config": gc,
           "session_config": sc,
           "config": c,
           "explanatory": e
         }

         return response;

       }
       else{
        console.log("Study length > 0")
         var response = {
           "status": "Update",
           "study_id" : study[0]._id
         }

         return response;
       }


  }

  s3mapper().then((t)=>{

    if(t.status == "Update"){

      res.send(JSON.stringify(t));
    }
    else if(t.status == "New") {
      console.log("Inside New")


    var study_id;
    var study_type;
    var group_array =[];
    var group_id_array = [];
    var group_ref_dict = {}
    var session_ref_dict = {}
    var session_array = []
    var subject_array = []
    var explanatory_array = []
    var repeat_measure_array =[]
    var finaldata = {}
    console.log("t dir config" + t.directory_config)
    //console.log(t.study_protocol)
    //console.log(t.group_config)
    //console.log(t.session_config)
    //console.log(t.config)
    //console.log(typeof(t.config))
    //console.log(t.explanatory)

    if(parseInt(t.directory_config[0][1])==1){
    
      study_type = "Parallel"
      console.log("Inside Parallel")
    }
    else{
      study_type = "Crossover"
      console.log("Inside Crossover")
    }
    //console.log(req.body.studykey)
    //console.log(req.body.bucketname)


  let newStudy = new Study({
    study_key: req.body.study_key,
    study_name: req.body.study_name,
    study_protocol: t.study_protocol[0][1],
    study_type: study_type

  })
 console.log("Create new study")
 console.log("testing groups")
 console.log("length: "+t.group_config.length)
 for (var group in t.group_config)
 {
   console.log("group:" +group)
 }
 Study.create(newStudy, function(err, study_res) {

    if (err) throw err;
    study_id = study_res._id
    //console.log(study_id);

    if(study_type == "Parallel") {
        console.log("Inside parallel study ")
    //Create Group
    for (var each_grp of String(t.group_config).split(',')){

        let newGroup = new Group({

          group_name: each_grp,
          group_study_id: study_id

        })

        Group.create(newGroup, function(err, group_res){

          if (err) throw err;

          group_ref_dict[group_res.group_name] = group_res._id;
          //console.log(group_ref_dict)
          group_id_array.push(group_ref_dict);
          group_array.push(group_res)
        })

      }

      setTimeout(function() {
                //console.log(group_ref_dict);

      //Create Subjects
      console.log("Inside create subs")
      for (var each_sub of t.config){
        var group_name = each_sub[1]
        var group_id = group_ref_dict[group_name]
        let newSubject = new Subject ({

          subject_name: each_sub[0],
          subject_group_id: group_id,
          subject_study_id: study_id,
          subject_attribute: each_sub[2],
          bad_subject : "",
          good_subject : "1",
          unused : "",
          video_consent : "0"

        })

        Subject.create(newSubject, function(err, subject_res){
          if (err) throw err;
          subject_array.push(subject_res)
        })

      }

    }, 1000);


      //Create Session
      var split_sessions = String(t.session_config).split(',')
      for (var each_session of split_sessions){
        console.log("Session "+ each_session)
        let newSession = new Session({
          session_name : each_session,
          session_study_id: study_id,
          //session_type: each_session[1]
          session_type: "" // Shaila
        })

        Session.create(newSession, function(err, session_res){

          if (err) throw err;

          session_ref_dict[session_res.session_name] = session_res._id;
          session_array.push(session_res);
          //group_id_array.push(group_ref_dict);

        })

      }

      //Explanatory Reference
      for (var each_explanatory of t.explanatory){
        if(each_explanatory[4] == "Signal") //|| each_explanatory[4] == "3D")
          explanatory_array.push(each_explanatory[0])
      }


      setTimeout(function() {
                if(t.directory_config[2][1]=='1'){
                  console.log("Repeat Measure is present")
                  //console.log(JSON.parse("[t.config[0][3]]"))
                  var old= t.config[0][3]
                  //console.log(old)
                  //old = old.substring(1)
                  //old = old.substring(0, old.length-1);
                  //console.log(old)
                  var arr = old.split(',')
                  console.log(arr.length)

                  //console.log(typeof(repeat))
                  //console.log((t.config[0][3]).length)
                  //console.log(session_array.length)
                  let no_of_repeat_measure = (arr.length)/(session_array.length)
                  //console.log(no_of_repeat_measure)
                  for (var k=1; k<=no_of_repeat_measure; k++){
                    let newRepeatMeasure = new Repeat_Measure({
                      repeat_measure_name: "Day"+k,
                      repeat_measure_study_id: study_id
                    })
                    Repeat_Measure.create(newRepeatMeasure, function(err, repease_measure_res){
                      if(err) throw err;
                      //console.log(repease_measure_res)
                      repeat_measure_array.push(repease_measure_res)
                    })
                  }

                  setTimeout(function() {
                            group_array.sort((a, b) => parseFloat(a.group_name) - parseFloat(b.group_name))
                            subject_array.sort((a, b) => parseFloat(a.subject_name) - parseFloat(b.subject_name))

                            finaldata["group"] = group_array
                            finaldata["subject"] = subject_array
                            finaldata["session"] = session_array
                            finaldata["repeat_measure"] = repeat_measure_array
                            finaldata["explanatory"] = explanatory_array
                            finaldata["status"] = "New"
                            res.send(JSON.stringify(finaldata))
                          }, 2000);

                }
                else{
                  console.log("Repeat Measure is not present")

                  setTimeout(function() {
                            group_array.sort((a, b) => parseFloat(a.group_name) - parseFloat(b.group_name))
                            subject_array.sort((a, b) => parseFloat(a.subject_name) - parseFloat(b.subject_name))

                            finaldata["group"] = group_array
                            finaldata["subject"] = subject_array
                            finaldata["session"] = session_array
                            finaldata["repeat_measure"] = []
                            finaldata["explanatory"] = explanatory_array
                            finaldata["status"] = "New"
                            res.send(JSON.stringify(finaldata))
                          }, 2000);

                }

              }, 1000);

    }



 })


}

})
});


//create study
router.post('/createstudy', (req, res) => {

    var count =0
    var rescount=0
    let newStudy = new Study({
      study_key: req.body.study_key,
      study_name: req.body.study_name,
      study_protocol: req.body.study_protocol,
      study_type: req.body.study_type
  
    })
  
   Study.create(newStudy, function(err, study_res) {
  
  
      if (err) throw err;
      console.log(study_res._id);
  
      if(study_res.study_type=="Parallel"){
  
        for (var i=0; i< req.body.group_name.length; i++){
         let newGroup = new Group({
  
            group_study_id: study_res._id,
            group_name:  req.body.group_name[i],
            no_of_subjects: req.body.no_of_subjects[i]
  
         })
  
         console.log(newGroup)
  
         Group.create(newGroup, function(err, group_res){
          if (err) throw err;
          //console.log(group_res);
          var group_res_array=[]
          group_res_array.push(group_res)
  
         for (var eachgroupid of group_res_array){
  
              for(var j=1; j<=eachgroupid.no_of_subjects; j++){
                let newSubject = new Subject({
  
                  subject_name: "Subject_"+j,
                  subject_study_id: study_res._id,
                  subject_group_id: eachgroupid._id,
  
                })
  
                Subject.create(newSubject, function(err, subject_res){
                  if (err) throw err;
                   //console.log(subject_res);
                   var subject_res_array=[]
                    subject_res_array.push(subject_res)
  
                    for(var eachsubject of subject_res_array){
  
                      //console.log(eachsubject)
  
                      for(var k=1; k<=req.body.repeat_measure; k++){
  
                        //console.log(req.body.repeat_measure)
  
                        for(var m=0; m<req.body.no_of_sessions; m++){
  
                          let newStimuli=new Stimuli({
  
                            stimuli_subject_id: eachsubject._id,
                            stimuli_study_id: eachsubject.subject_study_id,
                            stimuli_group_id: eachsubject.subject_group_id,
                            no_of_stimuli: req.body.session_stimuli[m],
                            stimuli_names: req.body.session_stimuli_names[m],
                            stimuli_values: req.body.session_stimuli_values[m]
  
  
                          })
  
                          Stimuli.create(newStimuli, function(err, stimuli_res){
                            if (err) throw err;
  
                          //console.log(req.body.no_of_sessions)
                          for(var n=0; n<req.body.explanatory_variable_type.length; n++){
                            //console.log(req.body.explanatory_variable_type[n])
                            if(req.body.explanatory_variable_type[n]=='Signal'){
  
                              count = count+1
                              console.log("The count is signal first" +  count)
                              let newExplanatoryVariable = {
  
                                subject_id: eachsubject._id,
                                subject_study_id: eachsubject.subject_study_id,
                                subject_group_id: eachsubject.subject_group_id,
                                explanatory_repeat_measure: k,
                                explanatory_session_name: req.body.session_name[m],
                                explanantory_stimuli_id: stimuli_res._id,
                                explanatory_variable_name: req.body.explanatory_variable_name[n],
                                explanatory_variable_type: req.body.explanatory_variable_type[n],
                                explanatory_variable_category: req.body.explanatory_variable_category[n],
                                explanatory_signal_x_axis_name:req.body.explanatory_signal_x_axis_name[n],
                                explanatory_signal_x_axis_value:[],
                                explanatory_signal_no_of_y_values:req.body.explanatory_signal_no_of_y_values[n],
                                explanatory_signal_y_axis_name:req.body.explanatory_signal_y_axis_name[n],
                                explanatory_signal_y_axis_value:[],
                                explanatory_signal_link_type:req.body.explanatory_signal_link_type[n],
                                explanatory_signal_video_link:[],
  
  
  
                              }
  
                              //console.log(newExplanatoryVariable)
  
                              Explanatory_Variables.create(newExplanatoryVariable, function(err, explanatory_res){
                                if (err) throw err;
  
                                  if(rescount==0){
                                    rescount=rescount+1
                                    res.send(explanatory_res)
                                  }
  
                                  //res.end()
                                //res.end(explanatory_res)
                                  //console.log(explanatory_res);
                              })
  
                            }
  
                            else if(req.body.explanatory_variable_type[n]=='Rank'){
                              count = count+1
                              let newExplanatoryVariable = {
  
                                subject_id: eachsubject._id,
                                subject_study_id: eachsubject.subject_study_id,
                                subject_group_id: eachsubject.subject_group_id,
                                explanatory_repeat_measure: k,
                                explanatory_session_name: req.body.session_name[m],
                                explanantory_stimuli_id: stimuli_res._id,
                                explanatory_variable_name: req.body.explanatory_variable_name[n],
                                explanatory_variable_type: req.body.explanatory_variable_type[n],
                                explanatory_variable_category: req.body.explanatory_variable_category[n],
                                explanatory_rank_sub_scales: req.body.explanatory_rank_sub_scales[n],
                                explanatory_rank_sub_scales_names: req.body.explanatory_rank_sub_scales_names[n],
                                explanatory_rank_sub_scales_range: req.body.explanatory_rank_sub_scales_range[n],
                                explanatory_rank_sub_scales_values: []
  
                              }
  
                              //console.log(newExplanatoryVariable)
  
                              Explanatory_Variables.create(newExplanatoryVariable, function(err, explanatory_res){
                                if (err) throw err;
  
                                if(rescount==0){
                                  rescount=rescount+1
                                  res.send(explanatory_res)
                                }
                                  //res.end()
                                  //console.log(explanatory_res);
                                  //res.end()
                              })
  
                            }
  
                            else if(req.body.explanatory_variable_type[n]=='Scalar'){
                              count = count+1
                              let newExplanatoryVariable = {
  
                                subject_id: eachsubject._id,
                                subject_study_id: eachsubject.subject_study_id,
                                subject_group_id: eachsubject.subject_group_id,
                                explanatory_repeat_measure: k,
                                explanatory_session_name: req.body.session_name[m],
                                explanantory_stimuli_id: stimuli_res._id,
                                explanatory_variable_name: req.body.explanatory_variable_name[n],
                                explanatory_variable_type: req.body.explanatory_variable_type[n],
                                explanatory_variable_category: req.body.explanatory_variable_category[n],
                                explanatory_scalar_quantities: req.body.explanatory_scalar_quantities[n],
                                explanatory_scalar_quantities_names: req.body.explanatory_scalar_quantities_names[n],
                                explanatory_scalar_quantities_values: []
  
                              }
  
                              //console.log(newExplanatoryVariable)
  
                              Explanatory_Variables.create(newExplanatoryVariable, function(err, explanatory_res){
                                if (err) throw err;
  
                                if(rescount==0){
                                  rescount=rescount+1
                                  res.send(explanatory_res)
                                }
                                  //res.end()
                                  //console.log(explanatory_res);
                                  //res.end()
                              })
  
                            }
  
                            else if(req.body.explanatory_variable_type[n]=='Categorical'){
                              count = count+1
                              let newExplanatoryVariable = {
  
                                subject_id: eachsubject._id,
                                subject_study_id: eachsubject.subject_study_id,
                                subject_group_id: eachsubject.subject_group_id,
                                explanatory_repeat_measure: k,
                                explanatory_session_name: req.body.session_name[m],
                                explanantory_stimuli_id: stimuli_res._id,
                                explanatory_variable_name: req.body.explanatory_variable_name[n],
                                explanatory_variable_type: req.body.explanatory_variable_type[n],
                                explanatory_variable_category: req.body.explanatory_variable_category[n],
                                explanatory_categorical_values: req.body.explanatory_categorical_values[n],
                                explanatory_categorical_values_names: req.body.explanatory_categorical_values_names[n],
                                explanatory_categorical_values_values: []
  
                              }
  
                              //console.log(newExplanatoryVariable)
  
                              Explanatory_Variables.create(newExplanatoryVariable, function(err, explanatory_res){
                                if (err) throw err;
  
                                if(rescount==0){
                                  rescount=rescount+1
                                  res.send(explanatory_res)
                                }
                                  //res.end()
                                  //console.log(explanatory_res);
                                  //res.end()
                              })
  
                            }
  
                          }
  
  
                          for(var n=0; n<req.body.response_variable_type.length; n++){
                            console.log(req.body.response_variable_type[n])
                            if(req.body.response_variable_type[n]=='Signal'){
  
                              //console.log(req.body.response_signal_no_of_stimuli[n])
  
                              let newResponseVariable = {
  
                                subject_id: eachsubject._id,
                                subject_study_id: eachsubject.subject_study_id,
                                subject_group_id: eachsubject.subject_group_id,
                                response_repeat_measure: k,
                                response_session_name: req.body.session_name[m],
                                response_stimuli_id: stimuli_res._id,
                                response_variable_name: req.body.response_variable_name[n],
                                response_variable_type: req.body.response_variable_type[n],
                                response_variable_category: req.body.response_variable_category[n],
                                response_signal_x_axis_name:req.body.response_signal_x_axis_name[n],
                                response_signal_x_axis_value:[],
                                response_signal_no_of_y_values:req.body.response_signal_no_of_y_values[n],
                                response_signal_y_axis_name:req.body.response_signal_y_axis_name[n],
                                response_signal_y_axis_value:[],
                                response_signal_link_type:req.body.response_signal_link_type[n],
                                response_signal_video_link:[],
  
  
                              }
  
                              //console.log(newResponseVariable)
  
                              Response_Variables.create(newResponseVariable, function(err, response_res){
                                if (err) throw err;
  
                                if(rescount==0){
                                  rescount=rescount+1
                                  res.send(response_res)
                                }
                                  //console.log(response_res);
                              })
  
                            }
  
                            else if(req.body.response_variable_type[n]=='Rank'){
  
                              let newResponseVariable = {
  
                                subject_id: eachsubject._id,
                                subject_study_id: eachsubject.subject_study_id,
                                subject_group_id: eachsubject.subject_group_id,
                                response_repeat_measure: k,
                                response_session_name: req.body.session_name[m],
                                response_stimuli_id: stimuli_res._id,
                                response_variable_name: req.body.response_variable_name[n],
                                response_variable_type: req.body.response_variable_type[n],
                                response_variable_category: req.body.response_variable_category[n],
                                response_rank_sub_scales: req.body.response_rank_sub_scales[n],
                                response_rank_sub_scales_names: req.body.response_rank_sub_scales_names[n],
                                response_rank_sub_scales_range: req.body.response_rank_sub_scales_range[n],
                                response_rank_sub_scales_values: []
  
                              }
  
                              //console.log(newResponseVariable)
  
                              Response_Variables.create(newResponseVariable, function(err, response_res){
                                if (err) throw err;
  
                                  //console.log(response_res);
                                  if(rescount==0){
                                    rescount=rescount+1
                                    res.send(response_res)
                                  }
                              })
  
                            }
  
                            else if(req.body.response_variable_type[n]=='Scalar'){
  
                              let newResponseVariable = {
  
                                subject_id: eachsubject._id,
                                subject_study_id: eachsubject.subject_study_id,
                                subject_group_id: eachsubject.subject_group_id,
                                response_repeat_measure: k,
                                response_session_name: req.body.session_name[m],
                                response_stimuli_id: stimuli_res._id,
                                response_variable_name: req.body.response_variable_name[n],
                                response_variable_type: req.body.response_variable_type[n],
                                response_variable_category: req.body.response_variable_category[n],
                                response_scalar_quantities: req.body.response_scalar_quantities[n],
                                response_scalar_quantities_names: req.body.response_scalar_quantities_names[n],
                                response_scalar_quantities_values: []
  
                              }
  
                              //console.log(newResponseVariable)
  
                              Response_Variables.create(newResponseVariable, function(err, response_res){
                                if (err) throw err;
  
                                  //console.log(response_res);
                                  if(rescount==0){
                                    rescount=rescount+1
                                    res.send(response_res)
                                  }
                              })
  
                            }
  
                            else if(req.body.response_variable_type[n]=='Categorical'){
  
                              let newResponseVariable = {
  
                                subject_id: eachsubject._id,
                                subject_study_id: eachsubject.subject_study_id,
                                subject_group_id: eachsubject.subject_group_id,
                                response_repeat_measure: k,
                                response_session_name: req.body.session_name[m],
                                response_stimuli_id: stimuli_res._id,
                                response_variable_name: req.body.response_variable_name[n],
                                response_variable_type: req.body.response_variable_type[n],
                                response_variable_category: req.body.response_variable_category[n],
                                response_categorical_values: req.body.response_categorical_values[n],
                                response_categorical_values_names: req.body.response_categorical_values_names[n],
                                response_categorical_values_values: []
  
                              }
  
                              //console.log(newResponseVariable)
  
                              Response_Variables.create(newResponseVariable, function(err, response_res){
                                if (err) throw err;
  
                                  //console.log(response_res);
                                  if(rescount==0){
                                    rescount=rescount+1
                                    res.send(response_res)
                                  }
                              })
  
                            }
  
                          }
  
  
  
  
  
                        })
  
  
  
                        }
  
                      }
  
                    }
  
  
  
                })
              }
  
          }
  
  
  
  
        })
  
        }
  
  
      }
  
  
    });
  
  })


//export router
module.exports = router;