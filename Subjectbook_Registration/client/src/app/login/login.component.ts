import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { CreateStudyService} from '../create-study.service'


@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
  providers: [AuthService]
})
export class LoginComponent implements OnInit {

  email: string;
  password: string;

  constructor(public authService: AuthService, private router: Router) {}


  login() {
    
    this.authService.login(this.email, this.password);
    this.email = this.password = '';    
  }

  route()
{
  this.router.navigate(['signup'])
}
  ngOnInit() {

  
  }

}
