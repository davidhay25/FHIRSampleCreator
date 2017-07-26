
angular.module("sampleApp")
    .controller('profileDiffCtrl',
        function ($scope,$q,$http,profileDiffSvc,$uibModal,logicalModelSvc,appConfigSvc,RenderProfileSvc,builderSvc,
                  Utilities,GetDataFromServer,profileCreatorSvc,$filter,$firebaseObject,$location,$window,modalService,
                    $timeout) {

            $scope.input = {includeExtensions:false,center:true,includeCore:true,immediateChildren:true,includeExtensions:true,includePatient:true};
            $scope.appConfigSvc = appConfigSvc;

            $scope.history = [];        //
            $scope.input.tabShowing='single';
            $scope.input.categories = ['profile','extension','terminology'];

            GetDataFromServer.registerAccess('igView');

            $scope.updateIG = function(){
                console.log($scope.currentIG);
            };

            //see if this page was loaded from a shortcut
            var hash = $location.hash();
            if (hash) {
                var sc = $firebaseObject(firebase.database().ref().child("shortCut").child(hash));
                sc.$loaded().then(
                    function(){


                        $scope.loadedFromBookmark = true;

                        //set the conformance server to the one in the bookmark
                        var conformanceServer =  sc.config.conformanceServer;
                        appConfigSvc.setServerType('conformance',conformanceServer.url);
                        //appConfigSvc.setServerType('data',conformanceServer.url);       //set the data server to the same as the conformance for the comments

                        var id = sc.config.model.id;    //the id of the model on this server
                        //get the model from the server...
                        var url = conformanceServer.url + 'StructureDefinition/'+id;
                        $scope.showWaiting = true;
                        GetDataFromServer.adHocFHIRQuery(url).then(
                            function(data){
                                var model = data.data;
                               // console.log(model);
                              //  $scope.hideLMSelector();            //only want to see this model...
                               // selectEntry({resource:model});       //select the model
                            },
                            function(){
                                modalService.showModal({}, {bodyText: "The model with the id '"+id + "' is not on the "+conformanceServer.name + " server"})
                            }
                        ).finally(function(){
                            $scope.showWaiting = false;
                        })

                    }
                )
            }

            $scope.clearCache = function(){
                profileDiffSvc.clearCache();
            };

            $scope.createDownload = function(){
                profileDiffSvc.createDownloadBundle($scope.currentIG).then(
                    function(bundle) {
                        console.log(bundle);
                    },function(bundle) {
                        console.log(bundle);
                    }
                );
            };

            $scope.importProfile = function(){

                var url = $window.prompt('Enter the Url of the profile');
                if (url) {
                    profileDiffSvc.getSD(url).then(
                        function (SD) {
                            console.log(SD);

                            var res = profileDiffSvc.findResourceInIGPackage($scope.currentIG,SD.url);
                            if (res) {
                                profileDiffSvc.clearSDProfile(SD.url);
                                modalService.showModal({}, {
                                    bodyText: "There is already an entry for this profile in the Guide. I've cleared it from the cache but you need to re-load the app for the new profile to be displayed."})
                                return
                            } else {
                                //add the profile to the IG - then find any extensions and add them as well. todo - should we check whether they exist first?
                                var pkg = $scope.currentIG.package[0];  //just stuff everything into the first package
                                pkg.resource = pkg.resource || []
                                var res = {sourceReference:{reference:url}};
                                //todo - should likely move to an extension for R3
                                if (appConfigSvc.getCurrentConformanceServer().version ==2) {
                                    res.purpose = 'profile'
                                } else {
                                    res.acronym = 'profile'
                                }
                                pkg.resource.push(res);
                            }



                            //now look for any extensions....
                            if (SD.snapshot && SD.snapshot.element) {
                                SD.snapshot.element.forEach(function (ed) {
                                    if (ed.type) {
                                        ed.type.forEach(function (typ) {
                                            if (typ.code == 'Extension' && typ.profile) {
                                                var profileUrl = typ.profile;
                                                if (angular.isArray(profileUrl)) {
                                                    profileUrl = typ.profile[0]
                                                }
                                                console.log(profileUrl);

                                                //make sure this is not already in the list
                                                //var found = false;
                                                var res = profileDiffSvc.findResourceInIGPackage($scope.currentIG,profileUrl);
                                                /*
                                                $scope.currentIG.package.forEach(function (pkg) {
                                                    pkg.resource.forEach(function (r) {
                                                        if (r.sourceReference) {
                                                            if (r.sourceReference.reference == profileUrl) {
                                                                found = true;
                                                            }
                                                        }

                                                    })
                                                });
                                                */
                                                if (!res) {
                                                    var res = {sourceReference:{reference:profileUrl}};
                                                    //todo - should likely move to an extension for R3
                                                    if (appConfigSvc.getCurrentConformanceServer().version ==2) {
                                                        res.purpose = 'extension'
                                                    } else {
                                                        res.acronym = 'extension'
                                                    }
                                                    pkg.resource.push(res);
                                                }



                                            }



                                        })
                                    }
                                })
                            }


                            $scope.dirty = true;
                            $scope.selectIG($scope.currentIG);

                        },function (err) {
                            alert("Sorry, can't find a profile with that Url...")
                        }
                    )


                    //alert(url)
                }
return;

                var url = appConfigSvc.getCurrentConformanceServer().url;
                url += 'StructureDefinition?kind=resource';
                GetDataFromServer.adHocFHIRQueryFollowingPaging(url).then(
                    function(data) {
                        console.log(data.data);
                    }
                )
            };

            $scope.generateShortCut = function() {
                var hash = Utilities.generateHash();
                var shortCut = $window.location.href+"#"+hash

                var sc = $firebaseObject(firebase.database().ref().child("shortCut").child(hash));
                sc.modelId = $scope.selectedSD.id;     //this should make it possible to query below...
                sc.config = {conformanceServer:appConfigSvc.getCurrentConformanceServer()};
                sc.config.model = {id:$scope.selectedSD.id}
                sc.shortCut = shortCut;     //the full shortcut
                sc.$save().then(
                    function(){
                        //$scope.treeData.shortCut = sc;
                        modalService.showModal({}, {bodyText: "The shortcut  " +  shortCut + "  has been generated for this model"})

                    }
                )
            };


            $scope.showExtension = function(SD){
                $uibModal.open({
                    templateUrl: 'modalTemplates/showExtension.html',
                    size: 'lg',
                    controller: function($scope,ext,Utilities) {
                        $scope.extensionAnalysis = Utilities.analyseExtensionDefinition3(ext)

console.log(ext)
                    },
                    resolve : {
                        ext: function () {          //the default config
                            return SD;
                        }
                    }

                })

            };



            //load a profile into the given side ('left','right')
            $scope.loadCompProfiles = function(side) {
                var svr = $scope.input['compareServer'+side];
                var type = $scope.input.compareResourceType;

                if (svr && type) {
                    //load the matching profiles...

                    var searchString = svr.url + "StructureDefinition?";

                    if (svr.version == 3) {
                        searchString += "kind=resource&base=http://hl7.org/fhir/StructureDefinition/"+type.name
                    } else {
                        //var base = "http://hl7.org/fhir/StructureDefinition/DomainResource";
                        searchString += "kind=resource&type="+type.name;
                    }

                    console.log(searchString)
                    $scope.waiting = true;

                    $http.get(searchString).then(       //first the profiles on that server ...
                        function(data) {
                            $scope.input['matchingProfiles'+side] = data.data;  //a bundle



                            //get the base type (if it exists)...
                            var url1 =  svr.url + "StructureDefinition/"+type.name;
                            $http.get(url1).then(       //and then get the base type
                                function (data) {
                                    if (data.data) {
                                        if (data.data) {
                                            $scope.input['matchingProfiles'+side].entry = $scope.input['matchingProfiles'+side].entry || []
                                            $scope.input['matchingProfiles'+side].entry.push({resource:data.data})
                                        }


                                    }

                                },
                                function () {
                                    //just ignore if we don't fine the base..
                                }
                            )



                            console.log(data.data)
                        },
                    function (err) {
                        console.log(err)
                    }).finally(function () {
                        $scope.waiting = false;
                    });
                }

                console.log(side,svr,type)
            };

            //select a single profile to display as a table...
            $scope.selectCompProfile = function(entry,side) {
              //  console.log(entry)
                var canonicalName = 'canonical'+side;
                var profilesBdl = $scope.input['matchingProfiles'+side];
                if (profilesBdl && profilesBdl.entry) {
                    profilesBdl.entry.forEach(function (p) {
                        if (p.resource.url == entry.resource.url) {

                            setCanonical(p.resource,canonicalName)

                            profileDiffSvc.analyseDiff($scope.canonicalLeft,$scope.canonicalRight)

                        }

                    })
                }


                function setCanonical(SD,canonicalName) {
                    profileDiffSvc.makeCanonicalObj(SD).then(
                        function (vo) {
                            //console.log(vo)
                            $scope[canonicalName] = vo.canonical;

                        },function (err) {
                            console.log(err)
                        }
                    )
                }
            };


            function addToHistory(type,resource) {
                $scope.history.push({type:type,resource:resource})
                //console.log($scope.history);
            }

            function popHistory() {
                if (history.length > 0) {
                    var hx = history.pop();
                    switch (hx.type) {
                        case 'profile' :

                            break;
                    }
                }
            }


            var fhirVersion = appConfigSvc.getCurrentConformanceServer().version;

            function clearRightPane(){
                //delete $scope.currentIG;
                delete $scope.selectedElementInLM;
                delete $scope.selectedItemType ;
                delete $scope.selectedItem;
                delete $scope.profileReport;
                delete $scope.allExtensions;

            }

            //used when selecting a single profile...
            RenderProfileSvc.getAllStandardResourceTypes().then(
                function(lst) {
                    $scope.allResourceTypes = lst
                }
            );
            
            $scope.findAdhHocProfile = function (baseType) {
                var svr =  appConfigSvc.getCurrentConformanceServer();
                var searchString = appConfigSvc.getCurrentConformanceServer().url + "StructureDefinition?";



                if (svr.version == 3) {
                    searchString += "kind=resource&base=http://hl7.org/fhir/StructureDefinition/"+$scope.results.profileType.name
                } else {
                    //var base = "http://hl7.org/fhir/StructureDefinition/DomainResource";
                    searchString += "kind=resource&type="+baseType.name;
                }

                //console.log(searchString)
                $scope.waiting = true;

                $http.get(searchString).then(       //first the profiles on that server ...
                    function(data) {
                        $scope.profilesOnBaseType = data.data;

                        var url1 =  appConfigSvc.getCurrentConformanceServer().url + "StructureDefinition/"+baseType.name;
                        $http.get(url1).then(       //and then get the base type
                            function (data) {
                                if (data.data) {
                                    //console.log(data.data)
                                    $scope.profilesOnBaseType.entry = $scope.profilesOnBaseType.entry || []
                                    $scope.profilesOnBaseType.entry.push({resource:data.data});

                                }

                            },
                            function () {
                                //just ignore if we don't fine the base..
                            }
                        ).finally(function () {
                            //console.log($scope.profilesOnBaseType)
                        })

                    },
                    function(err){
                        console.log(err)
                    }
                ).finally(function () {
                    $scope.waiting = false;
                });

            }

            $scope.selectAdhHocProfile = function(SD) {
                $scope.selectedItemType = 'profile';
                setupProfile(SD)
            };
            
            //load the IG's that describe 'collections' of conformance artifacts - like CareConnect & Argonaut
            var url = appConfigSvc.getCurrentConformanceServer().url + "ImplementationGuide";
            $http.get(url).then(
                function(data) {
                    $scope.listOfIG = []
                    if (data.data && data.data.entry) {
                        data.data.entry.forEach(function (entry) {
                            $scope.listOfIG.push(entry.resource)
                        })
                    }
                    $scope.input.selIG = $scope.listOfIG[0]
                },
                function(err){
                    console.log(err)
                }
            );

            //note that we're using an IG to hold all the resources in this collection
            $scope.selectIG = function(IG){
                clearRightPane();
                $scope.currentIG=IG;     //the List the holds this collection
                //console.log(IG)
                //now pull out the various artifacts into an easy to use object
                $scope.artifacts = {}
                $scope.currentIG.package.forEach(function (package) {
                    package.resource.forEach(function (resource) {
                        var purpose = resource.purpose || resource.acronym;     //<<< todo - 'purpose' was removed in R3...
                        $scope.artifacts[purpose] = $scope.artifacts[purpose] || []
                        $scope.artifacts[purpose].push({url:resource.sourceReference.reference, description:resource.description})
                    })
                });

               //temp createGraphOfIG(IG);

            };

            //-------- functions and properties to enable the valueset viewer
            $scope.showVSBrowserDialog = {};
            $scope.showVSBrowser = function(vs) {
                $scope.showVSBrowserDialog.open(vs);        //the open method defined in the directive...
            };

            $scope.showValueSet = function(uri,type) {
                //treat the reference as lookup in the repo...
                GetDataFromServer.getValueSet(uri).then(
                    function(vs) {

                        $scope.showVSBrowserDialog.open(vs);

                    }, function(err) {
                        alert(err)
                    }
                ).finally (function(){
                    $scope.showWaiting = false;
                });
            };

            //select an extension from within a profile...
            $scope.selectExtensionFromProfile = function (itemExtension) {
                //console.log(itemExtension);

                profileDiffSvc.getSD(itemExtension.url).then(
                    function (SD) {

                        $scope.showExtension(SD);
                        /*

                        $scope.selectedItemType = 'extension';
                        $scope.selectedExtension = SD;

                        $scope.selectedExtensionAnalysis = Utilities.analyseExtensionDefinition3(SD)
                        */
                    }
                )

            };

            //when an item is selected in the accordian for display in the right pane...
            $scope.selectItem = function(item,type){

                clearRightPane()

                $scope.selectedItemType = type;
                $scope.selectedItem = item;
                /*
               //when called to navigate to a profile...
               if (angular.isArray(item)) {
                   $scope.selectedItem = item[0];
               } else {
                   $scope.selectedItem = item;
               }
*/

               //console.log(item)
                centerNodeInGraph(item.url)

                if (type == 'logical') {

                    profileDiffSvc.getSD(item.url).then(
                        function (SD) {
                            var treeData = logicalModelSvc.createTreeArrayFromSD(SD)

                            logicalModelSvc.resetTreeState(treeData);
                            treeData[0].state.opened = true;

                            $('#lmTreeView').jstree('destroy');
                            $('#lmTreeView').jstree(
                                {'core': {'multiple': false, 'data': treeData, 'themes': {name: 'proton', responsive: true}}}
                            )
                        }
                    )




                }

               if (type == 'terminology') {
                   //really only works for ValueSet at this point...
                   profileDiffSvc.getTerminologyResource(item.url,'ValueSet').then(
                       function (vs) {
                           $scope.selectedValueSet = vs;
                       }, function (err) {
                           console.log(err)
                       }
                   )
               }

               if (type=='extension') {
                    profileDiffSvc.getSD(item.url).then(
                        function (SD) {
                            $scope.selectedExtension = SD;

                            $scope.selectedExtensionAnalysis = Utilities.analyseExtensionDefinition3(SD)
                        }
                    )
               }

               if (type=='profile') {
                   //this is a profiled resource - - an SD
                   // $scope.extensionSelected = true;



                   var url;
                   if (item && item.url) {
                       //called from the sidebar
                       url = item.url
                   } else {
                       //called by clicking a link in the table display (will be an array or string or a string)...
                       if (angular.isArray(item)) {
                           url = item[0]
                       } else {
                           url = item;
                       }
                   }


                   $scope.waiting = true;
                   //console.log($scope.selectedItem.url)


                   profileDiffSvc.getSD(url).then(
                   //GetDataFromServer.findConformanceResourceByUri(url).then(
                       function(SD){

                           setupProfile(SD)
                           addToHistory('profile',SD)

                       }, function (err) {
                           console.log(err)
                       }
                   ).finally(function () {
                       $scope.waiting = false;
                   })



               }


            };

            function setupProfile(SD) {
                $scope.selectedSD = SD;



                //------- other profiles on this base type...
                var baseType;

                if (fhirVersion == 2) {
                    //baseType = SD.base;
                    if (SD.base) {
                        baseType = $filter('getLogicalID')(SD.base);
                    }
                }

               /* Not sure why I was doing this. Comment out for the moment...
                if (baseType) {
                    profileDiffSvc.findProfilesOnBase(baseType).then(
                        function (bundle) {
                            console.log(bundle)
                            $scope.profilesOnTypeBdl = bundle

                        },
                        function (err) {
                            console.log("Error getting profiles on "+baseType,err);
                        }
                    )
                }
                */



                //-------- logical model
                profileCreatorSvc.makeProfileDisplayFromProfile(SD).then(
                    function(vo) {


                        $('#logicalTree').jstree('destroy');
                        $('#logicalTree').jstree(
                            {
                                'core': {
                                    'multiple': false,
                                    'data': vo.treeData,
                                    'themes': {name: 'proton', responsive: true}
                                }
                            }
                        ).on('select_node.jstree', function (e, data) {
                            if (data.node && data.node.data) {
                               // console.log(data.node && data.node.data);

                                $scope.selectedElementInLM = data.node.data.ed;

                                $scope.selectedED1 = data.node.data.ed;
                                $scope.$digest();       //as the event occurred outside of angular...

                            }
                        })
                    }
                );




                //------- raw model
                var treeData = logicalModelSvc.createTreeArrayFromSD(SD)

                console.log(treeData)

                $('#profileTree').jstree('destroy');
                $('#profileTree').jstree(
                    {'core': {'multiple': false, 'data': treeData, 'themes': {name: 'proton', responsive: true}}}
                ).on('changed.jstree', function (e, data) {
                    //seems to be the node selection event...
                    delete $scope.selectedED;
                    //console.log(data)
                    if (data.node) {
                        //console.log(data.node && data.node.data);
                        $scope.selectedED = data.node.data.ed;
                        $scope.$digest();       //as the event occurred outside of angular...

                    }
                })


                //------ canonical model
                //var vo = profileDiffSvc.makeCanonicalObj(SD);

                profileDiffSvc.makeCanonicalObj(SD).then(
                    function (vo) {
                        //console.log(vo)
                        $scope.canonical = vo.canonical;
                        $scope.allExtensions = vo.extensions;
                    },function (err) {
                        console.log(err)
                    }
                );

                //------ report
                $scope.profileReport = profileDiffSvc.reportOneProfile(SD);

            }


            $scope.drawGraph = function(){
                createGraphOfIG($scope.currentIG);

            };

            $scope.centeredNode = function(centeredOnly){
                if (!centeredOnly) {
                    createGraphOfIG($scope.currentIG);
                }
            }

            var makeOptions = function(){
                var options = {profiles:[]}
                if ($scope.input.includeExtensions) {
                    options.includeExtensions = true;
                }

                if ($scope.input.includeTerminology) {
                    options.includeTerminology = true;
                }
                if ($scope.input.includePatient) {
                    options.includePatient = true;
                }
                if ($scope.centredNodeUrl && $scope.input.center){
                    options.profiles.push($scope.centredNodeUrl)
                }
                if ($scope.input.includeCore) {
                    options.includeCore = true;
                }
                if ($scope.input.immediateChildren) {
                    options.immediateChildren = true;
                }

                return options;
            }

            var createGraphOfIG = function(IG,graphOptions) {
                if (! IG) {
                    return;
                }
                delete $scope.igGraphHash;
                delete $scope.graphReferences;
                delete $scope.selectedNodeFromGraph;
                console.log(IG);
                var graphOptions = graphOptions || makeOptions();

                profileDiffSvc.createGraphOfIG(IG,graphOptions).then(
                    function(graphData) {
                        //$scope.graphData = graphData;
                        var hashRelationships = graphData.hashRelationships;  //details of relationships (like path) = hash is <from>-<to>

                        console.log(graphData)

                        $scope.igGraphHash = graphData.hash;    //the hash generated during the IG analysis. Contains useful stuff like extension usedBy

                        var container = document.getElementById('igModel');

                        var options = {
                            layout: {randomSeed:8},
                            physics: {
                                enabled : true,
                                timestep : .35,
                                stabilization : {
                                    fit:true
                                },
                                barnesHut: {
                                    gravitationalConstant:-7500
                                }
                            },
                            edges : {
                                arrows: {
                                    to:true
                                }
                            }
                        };



                        $scope.profileNetwork = new vis.Network(container, graphData, options);

                        $scope.profileNetwork.on("click", function (obj) {
                            if (obj.edges.length > 0) {
                                delete $scope.selectedNodeFromGraph
                                console.log(obj.edges)
                                var edge = graphData.edges.get(obj.edges[0]);
                                //var relationship = hashRelationships[edge.from+'-'+edge.to];
                                $scope.graphReferences = hashRelationships[edge.from+'-'+edge.to];

                                console.log(hashRelationships[edge.from+'-'+edge.to])
                            }

                            if (obj.nodes.length > 0) {
                                var nodeId = obj.nodes[0];  //get the first node
                                delete $scope.graphReferences;

                                $scope.selectedNodeFromGraph = graphData.nodes.get(nodeId);

/* disable for now...
                                if ($scope.selectedNodeFromGraph && $scope.selectedNodeFromGraph.data && $scope.selectedNodeFromGraph.data.url) {
                                    $scope.selectItem({url:$scope.selectedNodeFromGraph.data.url, description:""},'profile')

                                    if ($scope.input.center && $scope.selectedNodeFromGraph) {
                                        var url = $scope.selectedNodeFromGraph.data.url;
                                        centerNodeInGraph(url)
                                    }
                                }

                                */
                            }


                            $scope.$digest();

                        });
                    }
                );
            };

            $scope.selectNodeFromGraph = function(){

                //find the idem in the artifacts list
                var item = {}
                $scope.artifacts['profile'].forEach(function (art) {
                    if (art.url == $scope.selectedNodeFromGraph.data.url) {
                        item = art;
                    }
                });


                if (item) {
                    $scope.selectItem(item,'profile')
                }


                if ($scope.input.center && $scope.selectedNodeFromGraph) {
                    var url = $scope.selectedNodeFromGraph.data.url;
                    centerNodeInGraph(url)
                }
            };

            $scope.fitGraph = function() {
                if ($scope.profileNetwork) {

                    $timeout(function(){
                        $scope.profileNetwork.fit();
                        console.log('fit')
                    },1000)
                }

            };

            function centerNodeInGraph(url) {
                $scope.centredNodeUrl = url;
                var options = makeOptions();
                options.profiles.push(url);
                createGraphOfIG($scope.currentIG,options);
                //$scope.$digest();

                $timeout(function(){
                    if ($scope.profileNetwork) {
                        $scope.profileNetwork.fit();
                        console.log('fit')
                    }

                },2000)
            }

    })
