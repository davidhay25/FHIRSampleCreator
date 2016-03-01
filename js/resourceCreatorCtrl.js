/* Controller for the resource builder
* Note that this uses jsTree to convert the internal resource model from a flat list to a hierarchy.
* todo - should replace that with a specific funciton...
* */


angular.module("sampleApp").controller('resourceCreatorCtrl',
    function ($scope,resourceCreatorSvc,GetDataFromServer,CommonDataSvc,SaveDataToServer,
              RenderProfileSvc,appConfigSvc,supportSvc,$uibModal,ResourceUtilsSvc) {


    //event fired by ng-include of main page after the main template page has been loaded...
    $scope.includeLoaded = function() {
        //initial load..
        loadProfile($scope.results.profileName);
    };

    var profile;                    //the profile being used as the base
    $scope.treeData = [];           //populates the resource tree
    $scope.results = {};            //the variable for resource property values...
    $scope.results.profileName = "Condition";   //default profile

    var type = $scope.results.profileName;      //todo - change type...

    $scope.selectProfile = function() {


        loadProfile($scope.results.profileName);
    };

    //config - in particular the servers defined. The samples will be going to the data server...
    $scope.config = appConfigSvc.config();
    //set the current dataserver...
    $scope.dataServer = $scope.config.allKnownServers[0];   //{name:,url:}
    appConfigSvc.setCurrentDataServer($scope.dataServer);


    //sample patient data...
    supportSvc.getAllData('1843164').then(
        //returns an object hash - type as hash, contents as bundle - eg allResources.Condition = {bundle}
        function(allResources){
            console.log(allResources)
            $scope.allResources = allResources;     //needed when selecting a reference to an existing resouce for this patient...
            //this is so the resourceBuilder directive  knows who the patient is - and their data.
            //the order is significant - allResources must be set first...
            CommonDataSvc.setAllResources(allResources);
            //$rootScope.currentPatient = patient;
/*
            $scope.outcome.allResources = allResources;
            //create a display object that can be sorted alphabetically...
            $scope.outcome.resourceTypes = [];
            angular.forEach(allResources,function(bundle,type){

                if (bundle && bundle.total > 0) {
                    $scope.outcome.resourceTypes.push({type:type,bundle:bundle});
                }


            });

            $scope.outcome.resourceTypes.sort(function(a,b){
                if (a.type > b.type) {
                    return 1
                } else {
                    return -1
                }
            });


            //for the reference navigator we need a plain list of resources...
            $scope.allResourcesAsList = [];
            $scope.allResourcesAsDict = {};
            angular.forEach(allResources,function(bundle,type){

                if (bundle.entry) {
                    bundle.entry.forEach(function(entry){
                        $scope.allResourcesAsList.push(entry.resource);
                        var hash = entry.resource.resourceType + "/"+entry.resource.id;
                        $scope.allResourcesAsDict[hash] = entry.resource;

                    })
                }
                //also need to add the reference resources to the dictionary (so thay can be found in outgoing references)
                supportSvc.getReferenceResources().forEach(function(resource){
                    var hash = resource.resourceType + "/"+resource.id;
                    $scope.allResourcesAsDict[hash] = resource;
                });
                //and finally the patient!
                var hash = "Patient/"+patient.id;
                $scope.allResourcesAsDict[hash] = patient;


            })
*/
        }

        )
    .finally(function(){
        $scope.loadingPatient = false;
    });


    //get all the standard resource types - the one defined in the fhir spec...
    RenderProfileSvc.getAllStandardResourceTypes().then(
        function(standardResourceTypes) {
            $scope.standardResourceTypes = standardResourceTypes ;

        }
    );


    //load the selected profile, and display the tree
    function loadProfile(profileName) {

        $scope.treeData.length = 0;
        delete $scope.selectedChild;    //a child element off the current path (eg Condition.identifier
        delete $scope.children;         //all the direct children for the current path
        delete $scope.dataType ;        //the datatype selected for data entry

        resourceCreatorSvc.getProfile(profileName).then(
            function(data) {
                profile = data;


                //now set the base type. If a Core profile then it will be the profile name. Otherwise, it is the constarinedType
                if (profile.constrainedType) {
                    type = profile.constrainedType;
                } else {type = profileName;
                    type = profileName;
                }


                //create the root node.
                $scope.treeData.push({id:'root',parent:'#',text:type,state:{opened:true},path:type,
                    ed:resourceCreatorSvc.getRootED(type)});
                resourceCreatorSvc.addPatientToTree(type+'.subject',{},$scope.treeData);  //todo - not always 'subject'
                drawTree();
            }
        );
    }






    $scope.saveToServer = function(){
        //remove bbe that are not referenced...
        var cleanedData = resourceCreatorSvc.cleanResource($scope.treeData);
        $scope.treeData = cleanedData;
        $scope.savingResource = true;

        drawTree(); //when the tree load is complete, the 'treebuild' event is raised. the handler looks at 'savingResource' and calls save...

    };

    //build the resource. Note that this depends on the model created by jsTree so can only be called
    //after that has been rendered...
    var buildResource = function(){
        var treeObject = $('#treeView').jstree().get_json();    //creates a hierarchical view of the resource
        $scope.resource = resourceCreatorSvc.buildResource(type,treeObject[0],$scope.treeData)
    };


    $scope.$on('treebuilt',function(){

        //called after the tree has been built. Mainly to support the saving
        if ($scope.savingResource) {
            SaveDataToServer.saveResource($scope.resource).then(
                function (data) {
                    console.log(data)
                },
                function (err) {
                    console.log(err)
                }
            )
        }



    });

    //draws the tree showing the current resource
    function drawTree() {
        $('#treeView').jstree('destroy');
        $('#treeView').jstree(
            { 'core' : {'data' : $scope.treeData ,'themes':{name:'proton',responsive:true}}}
        ).on('changed.jstree', function (e, data){
            //seems to be the node selection event...

            delete $scope.children;     //the node may not have children (only BackboneElement datatypes do...
            var node = getNodeFromId(data.node.id);

            $scope.selectedNode = node;
            if (node && node.ed) {
                //todo - now redundate.. see$scope.selectedNode
                $scope.selectedNodeId = data.node.id;   //the currently selected element. This is the one we'll add the new data to...

                resourceCreatorSvc.getPossibleChildNodes(node.ed).then(
                    function(data){
                        $scope.children = data;    //the child nodes...
                    },
                    function(err){

                    }
                );

            }

            delete $scope.dataType;     //to hide the display...

            $scope.$digest();       //as the event occurred outside of angular...

        }).on('redraw.jstree',function(e,data){
            buildResource();
            $scope.$broadcast('treebuilt');
            $scope.$digest();       //as the event occurred outside of angular...
        });
    }


    //when one of the datatypes of the child nodes of the currently selected element in the tree is selected...
    $scope.childSelected = function(ed,inx) {
        //console.log(inx)
        $scope.selectedChild = ed;
        //the datatype of the selected element. This will drive the data entry form.
        $scope.dataType = ed.type[inx].code;

        if ($scope.dataType == 'BackboneElement') {
            //if this is a BackboneElement, then add it to the tree and select it todo - may want to ask first
            var treeNode = {id : new Date().getTime(),state:{opened:true}}
            treeNode.parent =  $scope.selectedNodeId;
            treeNode.ed = $scope.selectedChild;     //the ElementDefinition that we are adding
            treeNode.text = $scope.selectedChild.myData.display;    //the property name
            treeNode.path = $scope.selectedChild.path;
            //treeNode.type = 'bbe';      //so we know it's a backboneelement, so should have elements referencing it...
            treeNode.isBbe = true;      //so we know it's a backboneelement, so should have elements referencing it...
            //add the new node to the tree...
            $scope.treeData.push(treeNode);    //todo - may need to insert at the right place...


            $scope.selectedNodeId = treeNode.id;   //the currently selected element in the tree. This is the one we'll add the new data to...
            var node = getNodeFromId(treeNode.id);

            resourceCreatorSvc.getPossibleChildNodes(node.ed).then(
                function(data){
                    $scope.children = data;    //the child nodes...
                },
                function(err){

                }
            );


            drawTree() ;        //and redraw...

        } else {
            //this is a normal element - get set up to enter data specific to the datatype...

            //todo this is all carryover stuff - should go thru and check if needed...
            $scope.index = inx;         //save the position of this element in the list for the skip & next button
            delete $scope.externalReferenceSpecPage;
            delete $scope.elementDefinition;
            delete $scope.vsExpansion;
            delete $scope.UCUMAge;

            delete $scope.resourceReferenceText;
            delete $scope.profileUrlInReference;
            delete $scope.resourceList;

            $scope.results = {};                //clear any existing data...
            $scope.results.boolean = false;
            $scope.results.timing = {};         //needed for timing values...

            $scope.externalReferenceSpecPage = "http://hl7.org/datatypes.html#" + $scope.dataType;
            resourceCreatorSvc.dataTypeSelected($scope.dataType,$scope.results,ed,  $scope)
        }
    };


    //when a new element has been populated. The 'find reference resource' function creates the fragment - the others don't
    $scope.saveNewDataType = function(fragment) {
        fragment = fragment || resourceCreatorSvc.getJsonFragmentForDataType($scope.dataType,$scope.results);
        //var fragment = resourceCreatorSvc.getJsonFragmentForDataType($scope.dataType,$scope.results);
        //now add the new property to the tree...
        var treeNode = {id : new Date().getTime(),state:{opened:true},fragment:fragment.value,display:fragment.text}
        treeNode.parent =  $scope.selectedNodeId;
        treeNode.ed = $scope.selectedChild;     //the ElementDefinition that we are adding
        treeNode.text = $scope.selectedChild.myData.display;    //the property name
        treeNode.path = $scope.selectedChild.path;
        treeNode.dataType = {code : $scope.dataType};
        //add the new node to the tree...
        $scope.treeData.push(treeNode);    //todo - may need to insert at the right place...

        drawTree() ;        //and redraw...
        //delete the datatype - this will hide the input form...
        delete  $scope.dataType;
    };

    //when entering a new element
    $scope.cancel = function() {
        delete $scope.dataType;
    };

    $scope.removeNode = function() {
        var id = $scope.selectedNode.id;
        var inx = -1;
        for (var i=0; i<$scope.treeData.length;i++) {
            if ($scope.treeData[i].id == id) {
                inx = i;
            }
        }
        if (inx > -1) {
            $scope.treeData.splice(inx,1);
            drawTree();
        }

    };

    var getNodeFromId = function(id) {
        for (var i=0; i<$scope.treeData.length;i++) {
            if ($scope.treeData[i].id == id) {
                return $scope.treeData[i]
            }
        }
        return null;
    };



    //--------- code for CodeableConcept lookup
    $scope.vsLookup = function(text,vs) {
        if (vs) {
            $scope.showWaiting = true;
            return GetDataFromServer.getFilteredValueSet(vs,text).then(
                function(data,statusCode){

                    $scope.showWaiting = false;

                    if (data.expansion && data.expansion.contains) {

                        var lst = data.expansion.contains;
                        return lst;
                    } else {
                        return [
                            {'display': 'No expansion'}
                        ];
                    }
                }, function(vo){
                    var statusCode = vo.statusCode;
                    var msg = vo.error;

                    $scope.showWaiting = false;
                    alert(msg);

                    return [
                        {'display': ""}
                    ];
                }
            );

        } else {
            return [{'display':'Select the ValueSet to query against'}];
        }
    };

    //variables for the vs browser dialog.
    //  <vs-browser trigger="showVSBrowserDialog"></vs-browser> is defined in renderProfile.html
    $scope.showVSBrowserDialog = {};
    $scope.showVSBrowser = function(vs) {
        $scope.showVSBrowserDialog.open(vs);        //the open method defined in the directive...
    };

    //----this is called when a user clicked on the 'explore valueset' button
    $scope.showVSBrowserDlg = function() {

        $scope.showWaiting = true;

        GetDataFromServer.getValueSet($scope.vsReference).then(
            function(vs) {

                $scope.showVSBrowserDialog.open(vs);

            }
        ).finally (function(){
            $scope.showWaiting = false;
        });

    };


    //------- when the user wants to find a reference type resource - ie one that doesn't refernece a patient...
    $scope.searchResource = function() {

        var modalInstance = $uibModal.open({
            templateUrl: "/modalTemplates/searchForResource.html",
            size : 'lg',
            controller: 'searchForResourceCtrl',
            resolve: {
                vo : function() {
                    return {
                        resourceType: $scope.resourceType
                    }
                },
                profileUrl : function() {
                    //if this is a profiled reference...
                    return $scope.profileUrlInReference;
                }
            }
        });

        //a promise to the resolved when modal exits.
        modalInstance.result.then(function (selectedResource) {
            //user clicked OK
            if (selectedResource) {


                var v = {reference: selectedResource.resourceType + "/" + selectedResource.id};
                v.display = ResourceUtilsSvc.getOneLineSummaryOfResource(selectedResource);

                $scope.saveNewDataType({value:v,text:v.display});

                //temp v.display = ResourceUtilsSvc.getOneLineSummaryOfResource(selectedResource);
                //addValue(v,'Reference',"");
                //buildResource();
                //delete $scope.dataType;
            }

        }, function () {
            //no resource selected...
        });
    };


});