import { Component, OnInit } from '@angular/core';
import { AuthService } from '../auth.service';

import { CreateStudyService } from '../create-study.service'
import { createStudy } from '../create-study';
import { VariablesService } from '../variables.service'
import { Variables } from '../variables.model'

import { FileUploader } from 'ng2-file-upload';
import {FormControl} from "@angular/forms"
import { AngularFirestore } from '@angular/fire/firestore';

import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

const URL = 'http://subjectbook2.times.uh.edu/subjectbook_db/api/uploadDataFile';

@Component({
  selector: 'app-createStudy',
  templateUrl: './create-study.component.html',
  styleUrls: ['./create-study.component.scss'],
  providers: [CreateStudyService]
})
export class CreateStudyComponent implements OnInit {
  uploader:FileUploader;
  hasBaseDropZoneOver:boolean;
  hasAnotherDropZoneOver:boolean;
  response:string;

  createStudies : createStudy[];
  createStudy : createStudy;
  // _id : string;
  study_key : string;
  study_name : string;
  // study_protocol : string;
  study_type : string;
  explanatory_variables : string;
  response_variables : string;

  variableName: string;
  measurementUnit: string;

  graph_exp_var : [string];
  exp_graphs : [[string]];
  exp_index : number;
  exp_graph_index : number;

  graph_res_var : [string];
  res_graphs : [[string]];
  res_index : number;
  res_graph_index : number;

  variables: Observable<Variables[]>;
  dummy_var: [string]

  select_exp_Control:FormControl = new FormControl();
  explanatory_variables_list: FormControl = new FormControl();
  explanatory_variables_graph_list: FormControl = new FormControl();

  select_res_Control:FormControl = new FormControl();
  response_variables_list: FormControl = new FormControl();
  response_variables_graph_list: FormControl = new FormControl();

  constructor(public authService: AuthService, private createStudyService: CreateStudyService, 
    private variablesService: VariablesService, private db: AngularFirestore) 
  {    
    this.uploader = new FileUploader({url: URL, itemAlias: 'file'});
    this.hasBaseDropZoneOver = false;
    this.hasAnotherDropZoneOver = false;
 
    this.response = '';
 
    this.uploader.response.subscribe( res => this.response = res );

    this.graph_exp_var = ['']
    this.exp_graphs = [['']]
    this.exp_index = 0
    this.exp_graph_index = 0

    this.graph_res_var = ['']
    this.res_graphs = [['']]
    this.res_index = 0
    this.res_graph_index = 0

    
// get available explanatory variables from Firebase database
  this.variables = this.db.collection<Variables>('Variables')
         .snapshotChanges().pipe(
           map(actions => actions.map(a => {
             const data = a.payload.doc.data() as Variables;
             const id = a.payload.doc.id;
             return { id, ...data };
           }))
         );
        }

  // create new explanatory variable with measurement Unit
  createVariable()
  {
    const variable = {
      variable_name: this.variableName,
      measurement_unit: this.measurementUnit
    }
    this.variablesService.createVariable(variable);
    alert("Variable added");
    this.variableName = ""
    this.measurementUnit = ""
    // this.variables$.subscribe(data => console.log(data));
  }


   public fileOverBase(e:any):void {
    this.hasBaseDropZoneOver = e;
  }

  public fileOverAnother(e:any):void {
    this.hasAnotherDropZoneOver = e;
  }

  
  
  ngOnInit(): void {
    this.uploader.onBeforeUploadItem = (item) => {
      item.withCredentials = false;
    }

    this.variables.subscribe(data => console.log(data));

    // this.variables.forEach(variable => console.log("var is " + variable[0].variable_name) )


  }

  // add explanatory variable to graph
  add_exp_var()
  {
    var exp_var = this.select_exp_Control.value;
    this.graph_exp_var[this.exp_index] = exp_var;
    this.exp_index++;
    this.graph_exp_var.filter(val => val.length != 0)
    this.explanatory_variables_list.setValue(JSON.stringify(this.graph_exp_var));
  }

  // add the graph with explanatory variables
  add_exp_graph()
  {
    this.exp_graphs[this.exp_graph_index] = this.graph_exp_var
    this.exp_graph_index++;
    this.graph_exp_var = [''];
    this.exp_index = 0;
    console.log("graphs added" + this.exp_graphs)
    this.explanatory_variables_graph_list.setValue(JSON.stringify(this.exp_graphs))
    this.explanatory_variables_list.setValue(this.graph_exp_var);
    this.explanatory_variables = JSON.stringify(this.exp_graphs)
  }

  // reset explanatory variable fields
  reset_exp_var()
  {
    this.graph_exp_var = ['']
    this.exp_graphs = [['']]
    this.exp_index = 0
    this.exp_graph_index = 0
    this.explanatory_variables_list.setValue(null)
    this.explanatory_variables_graph_list.setValue(null)
  }

  // add response variables to graph
  add_res_var()
  {
    var res_var = this.select_res_Control.value;
    this.graph_res_var[this.res_index] = res_var;
    this.res_index++;
    this.graph_res_var.filter(val => val.length != 0)
    this.response_variables_list.setValue(JSON.stringify(this.graph_res_var));
  }

  // add response variable graph
  add_res_graph()
  {
    // this.graphs.push.apply(this.graphs, this.graph_exp_var)
    this.res_graphs[this.res_graph_index] = this.graph_res_var
    this.res_graph_index++;
    this.graph_res_var = [''];
    this.res_index = 0;
    console.log("graphs added" + this.res_graphs)
    this.response_variables_graph_list.setValue(JSON.stringify(this.res_graphs))
    this.response_variables_list.setValue(this.graph_res_var);
    this.response_variables = JSON.stringify(this.res_graphs)
  }

  // reset response variable fields
  reset_res_var()
  {
    this.graph_res_var = ['']
    this.res_graphs = [['']]
    this.res_index = 0
    this.res_graph_index = 0
    this.response_variables_list.setValue(null)
    this.response_variables_graph_list.setValue(null)
  }

  // logout
  logout() 
  {
    this.authService.logout();
  }

  // reset all fields
  reset_fields()
  {
    this.reset_exp_var()
    this.reset_res_var()
    this.study_name = ''
    this.study_key = '' 
  }

  // handle Submit button click
   uploadStudyData()
   {
     alert("Please stay on this page to know about study creation status.\nDo not submit another request.")
      const newStudyData = {
        // _id : this._id,
        study_key : this.study_key,
        study_name : this.study_name,
        // study_protocol : this.study_protocol,
        study_type : this.study_type,
        explanatory_variables : this.explanatory_variables,
        response_variables: this.response_variables
      }

      const findStudyData = 
      {
        study_key : this.study_key,
        study_name : this.study_name
      }

      // delete study only if valid details provided by user
      this.createStudyService.deleteStudy(findStudyData)
          .subscribe(study => {
            if(study == 'success')
            {
              this.createStudyService.createStudy(newStudyData)
              .subscribe(study => {
                // display responses from APIs
                if(JSON.parse(study) == 'success')
                {
                  alert("Uploaded study data into database! \
                  \nVisit http://subjectbook2.times.uh.edu/visualize/" + this.study_name + " to view the study!");
                  this.reset_fields()
                }
                else
                {
                  alert("Error uploading study data!");
                }
                this.createStudies.push(study);
              });
              console.log("deleted old study data")
            }
            else
            {
              alert("Study not found! \nPlease check study name and study key specified.");
              console.log("study not found error")
            }
          });
   }

}
