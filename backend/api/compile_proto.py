import os
import sys
from grpc_tools import protoc

def compile():
    # Get the directory of this script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    # The api root is the script dir (since script is in root of api/ or maybe I put it in scripts/?)
    # Wait, I am putting this in backend/api/compile_proto.py
    
    project_root = script_dir # backend/api
    proto_dir = os.path.join(project_root, 'proto')
    
    print(f"Compiling protos in {proto_dir}...")
    
    # Command arguments for protoc
    # -I defines the import search path
    # --python_out defines where to output python code
    # --grpc_python_out defines where to output grpc code (we don't strictly need grpc now but good to have)
    # The last argument is the proto file
    
    proto_file = os.path.join(proto_dir, 'tak.proto')
    
    if not os.path.exists(proto_file):
        print(f"Error: {proto_file} not found.")
        sys.exit(1)

    protoc_args = [
        'grpc_tools.protoc',
        f'-I{project_root}', # Include from api root so import is 'proto.tak_pb2' or similar? 
                             # Actually standard practice is usually root of the source tree. 
                             # If we do -I{project_root}, then 'proto/tak.proto' will generate 'proto/tak_pb2.py' inside 'proto/'?
                             # Let's try to output INTO the proto dir.
        f'--python_out={project_root}', 
        # f'--grpc_python_out={project_root}', # distinct from regular python?
        proto_file
    ]
    
    print(f"Running: {' '.join(protoc_args)}")
    result = protoc.main(protoc_args)
    
    if result == 0:
        print("Compilation successful.")
    else:
        print("Compilation failed.")
        sys.exit(result)

if __name__ == "__main__":
    compile()
