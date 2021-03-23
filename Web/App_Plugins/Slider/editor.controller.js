angular.module("umbraco").controller("my.custom.grideditorcontroller",
    function ($scope, $rootScope, $timeout, userService, mediaHelper,
        cropperHelper, editorState, umbRequestHelper, fileManager,
        angularHelper, dialogService, entityResource, macroService,
        localizationService) {
        console.log('init', $scope.control);
        var cfg = $scope.control.editor.config;
        var multiPicker = cfg.multiPicker && cfg.multiPicker !== '0' ? true : false;
        var onlyImages = cfg.onlyImages && cfg.onlyImages !== '0' ? true : false;
        var disableFolderSelect = cfg.disableFolderSelect && cfg.disableFolderSelect !== '0' ? true : false;
        $scope.mediaItems = $scope.control.value;
        $scope.ids = [];
        function setupViewModel() {
            $scope.mediaItems = [];
            $scope.ids = [];
            $scope.isMultiPicker = multiPicker;
            if ($scope.control.value) {
                //var ids = $scope.control.value.split(',');
                var ids = [];
                _.each($scope.control.value, function (media, i) {
                    ids.push(media.id);
                });

                //NOTE: We need to use the entityResource NOT the mediaResource here because
                // the mediaResource has server side auth configured for which the user must have
                // access to the media section, if they don't they'll get auth errors. The entityResource
                // acts differently in that it allows access if the user has access to any of the apps that
                // might require it's use. Therefore we need to use the metaData property to get at the thumbnail
                // value.
                entityResource.getByIds(ids, 'Media').then(function (medias) {
                    console.log('entityResource', $scope.control.value);
                    // The service only returns item results for ids that exist (deleted items are silently ignored).
                    // This results in the picked items value to be set to contain only ids of picked items that could actually be found.
                    // Since a referenced item could potentially be restored later on, instead of changing the selected values here based
                    // on whether the items exist during a save event - we should keep "placeholder" items for picked items that currently
                    // could not be fetched. This will preserve references and ensure that the state of an item does not differ depending
                    // on whether it is simply resaved or not.
                    // This is done by remapping the int/guid ids into a new array of items, where we create "Deleted item" placeholders
                    // when there is no match for a selected id. This will ensure that the values being set on save, are the same as before.
                    medias = _.map(ids, function (id) {
                        var found = _.find(medias, function (m) {
                            // We could use coercion (two ='s) here .. but not sure if this works equally well in all browsers and
                            // it's prone to someone "fixing" it at some point without knowing the effects. Rather use toString()
                            // compares and be completely sure it works.
                            return m.udi.toString() === id.toString() || m.id.toString() === id.toString();
                        });
                        if (found) {
                            return found;
                        } else {
                            return {
                                name: localizationService.dictionary.mediaPicker_deletedItem,
                                id: cfg.idType !== 'udi' ? id : null,
                                udi: cfg.idType === 'udi' ? id : null,
                                icon: 'icon-picture',
                                thumbnail: null,
                                trashed: true
                            };
                        }
                    });
                    _.each(medias, function (media, i) {
                        // if there is no thumbnail, try getting one if the media is not a placeholder item
                        if (!media.thumbnail && media.id && media.metaData) {
                            media.thumbnail = mediaHelper.resolveFileFromEntity(media, true);
                        }
                        $scope.mediaItems.push(media);
                        if (cfg.idType === 'udi') {
                            $scope.ids.push(media.udi);
                        } else {
                            $scope.ids.push(media.id);
                        }
                    });
                    $scope.sync();
                });
            }
        }
        //setupViewModel();
        $scope.remove = function (index) {
            $scope.mediaItems.splice(index, 1);
            $scope.ids.splice(index, 1);
            $scope.sync();
        };
        $scope.goToItem = function (item) {
            $location.path('media/media/edit/' + item.id);
        };
        $scope.add = function () {
            $scope.mediaPickerOverlay = {};
            $scope.mediaPickerOverlay.view = 'mediapicker';
            $scope.mediaPickerOverlay.title = 'Select media';
            //$scope.mediaPickerOverlay.startNodeId = cfg && cfg.startNodeId ? cfg.startNodeId : null;
            //$scope.mediaPickerOverlay.startNodeIsVirtual = cfg.mediaPickerOverlay.startNodeId ? cfg.startNodeIsVirtual : null;
            //$scope.mediaPickerOverlay.dataTypeId = $scope.control && $scope.control.editor.dataTypeId ? $scope.control.editor.dataTypeId : null;
            $scope.mediaPickerOverlay.cropSize = cfg && cfg.size ? cfg.size : null;
            $scope.mediaPickerOverlay.showDetails = true;
            $scope.mediaPickerOverlay.disableFolderSelect = disableFolderSelect;
            $scope.mediaPickerOverlay.onlyImages = onlyImages;
            $scope.mediaPickerOverlay.multiPicker = multiPicker;
            $scope.mediaPickerOverlay.show = true;
            $scope.mediaPickerOverlay.submit = function (model) {
                _.each(model.selectedImages, function (media, i) {
                    // if there is no thumbnail, try getting one if the media is not a placeholder item
                    if (!media.thumbnail && media.id && media.metaData) {
                        media.thumbnail = mediaHelper.resolveFileFromEntity(media, true);
                    }
                    $scope.mediaItems.push($scope.setImage(media));

                    if (cfg.idType === 'udi') {
                        $scope.ids.push(media.udi);
                    } else {
                        $scope.ids.push(media.id);
                    }
                });
                $scope.sync();
                $scope.mediaPickerOverlay.show = false;
                $scope.mediaPickerOverlay = null;
            };
        };

        $scope.setImage = function (media) {
            $scope.setUrl(media);
            return {
                id: media.id,
                image: media.image,
                name: media.name,
                thumbnail: media.thumbnail,
                trashed: media.trashed,
                urlFocalCrop: $scope.setUrl(media)
            };
        }
        $scope.setUrl = function (media) {
            var url = media.image;
            if (cfg && cfg.size) {
                url += '?width=' + cfg.size.width;
                url += '&height=' + cfg.size.height;
                url += '&animationprocessmode=first';
                if (media.focalPoint) {
                    url += '&center=' + media.focalPoint.top + ',' + media.focalPoint.left;
                    url += '&mode=crop';
                }
            }
            // set default size if no crop present (moved from the view)
            if (url.indexOf('?') == -1) {
                url += '?width=800&upscale=false&animationprocessmode=false';
            }
            return url;
        }
        $scope.sortableOptions = {
            disabled: !$scope.isMultiPicker,
            items: 'li:not(.add-wrapper)',
            cancel: '.unsortable',
            update: function (e, ui) {
                var r = [];
                // TODO: Instead of doing this with a half second delay would be better to use a watch like we do in the
                // content picker. Then we don't have to worry about setting ids, render models, models, we just set one and let the
                // watch do all the rest.
                $timeout(function () {
                    angular.forEach($scope.mediaItems, function (value, key) {
                        r.push(cfg.idType === 'udi' ? value.udi : value.id);
                    });
                    $scope.ids = r;
                    $scope.sync();
                }, 500, false);
            }
        };
        $scope.sync = function () {
            //$scope.control.value = $scope.ids.join();
            //$scope.control.value = $scope.mediaItems;
            //$scope.control.value = [];
            //_.each($scope.mediaItems, function (media, i) {

            //    $scope.control.value.push({                    
            //        id: media.id,
            //        udi: media.udi,                    
            //        image: url                    
            //    });
            //});
        };
        $scope.showAdd = function () {
            if (!multiPicker) {
                if ($scope.control.value && $scope.control.value !== '') {
                    return false;
                }
            }
            return true;
        };
        //here we declare a special method which will be called whenever the value has changed from the server
        //this is instead of doing a watch on the control.value = faster
        $scope.control.onValueChanged = function (newVal, oldVal) {
            //update the display val again if it has changed from the server
            setupViewModel();
        };


    });