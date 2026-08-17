from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, EmailStr, Field

app = FastAPI(title="HR Agent Automation Portal")

class NewHireRequest(BaseModel):
    full_name: str = Field(..., min_length=2, examples=["John Doe"])
    email: EmailStr  
    department: str = Field(..., examples=["Engineering", "HR", "Sales"])
    annual_salary: float = Field(..., gt=0, description="Salary must be greater than 0")

employees_db = []

@app.get("/")
def home():
    return {"message": "Welcome to the HR Automation API. Go to /docs to test endpoints!"}

@app.post("/onboard/")
def onboard_employee(employee: NewHireRequest):
    for emp in employees_db:
        if emp["email"] == employee.email:
            raise HTTPException(status_code=400, detail="An employee with this email already exists.")
    
    new_employee = employee.model_dump()
    new_employee["id"] = len(employees_db) + 1
    employees_db.append(new_employee)
    
    return {
        "status": "Success",
        "message": f"Welcome letter generated and queued for {employee.full_name}!",
        "employee_data": new_employee
    }

@app.get("/employees/")
def list_employees():
    return {"total_employees": len(employees_db), "employees": employees_db}