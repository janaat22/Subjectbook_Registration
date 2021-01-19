import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateStudyComponent } from './create-study.component';

describe('CreateStudyComponent', () => {
  let component: CreateStudyComponent;
  let fixture: ComponentFixture<CreateStudyComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ CreateStudyComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(CreateStudyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
